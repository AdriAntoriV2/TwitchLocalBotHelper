import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { EventSubEnvelope } from 'streamops-twitch-connector';
import { TwitchConnectorService } from './twitch-connector.service.js';
import { TwitchEventNormalizer } from './twitch-event-normalizer.service.js';
import { TwitchEventIngestionService } from './twitch-event-ingestion.service.js';
import { StreamsService } from '../streams/streams.service.js';
import { EventsService } from '../events/events.service.js';
import { ChatCommandDispatcher } from '../commands/chat-command-dispatcher.service.js';
import { PointPoolService } from '../point-pool/point-pool.service.js';
import { FirstOverlayService } from '../first-overlay/first-overlay.service.js';
import { ChatOverlayService } from '../chat-overlay/chat-overlay.service.js';

interface Subscription {
  type: string;
  version: string;
  condition: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class TwitchEventSubService implements OnModuleDestroy {
  private readonly logger = new Logger(TwitchEventSubService.name);
  private readonly removeSessionListener: () => void;
  private readonly removeNotificationListener: () => void;

  constructor(
    private readonly connector: TwitchConnectorService,
    private readonly streamsService: StreamsService,
    private readonly eventsService: EventsService,
    private readonly normalizer: TwitchEventNormalizer,
    private readonly ingestionService: TwitchEventIngestionService,
    private readonly chatCommandDispatcher: ChatCommandDispatcher,
    private readonly pointPoolService: PointPoolService,
    private readonly firstOverlayService: FirstOverlayService,
    private readonly chatOverlayService: ChatOverlayService,
  ) {
    this.removeSessionListener = this.connector.client.eventSub.onSession(
      async (sessionId, isReconnectHandover) => {
        if (isReconnectHandover || !this.connector.isReady) {
          return;
        }

        await this.handleSession(sessionId);
      },
    );

    this.removeNotificationListener =
      this.connector.client.eventSub.onNotification(
        async (type, event, envelope) => {
          if (!this.connector.isReady) {
            return;
          }

          try {
            await this.handleNotification(type, event, envelope);
          } catch (error) {
            const requiresLogin = await this.connector.handleError(error);
            this.logger.error(
              `Failed to process Twitch EventSub notification: ${type}`,
              error instanceof Error ? error.stack : String(error),
            );

            if (requiresLogin) {
              return;
            }
          }
        },
      );
  }

  async onModuleDestroy(): Promise<void> {
    this.removeSessionListener();
    this.removeNotificationListener();
  }

  private async handleSession(sessionId: string): Promise<void> {
    const broadcasterUserId = this.connector.getBroadcasterUserId();
    const authenticatedUserId = this.connector.getAuthenticatedUserId();

    if (!broadcasterUserId || !authenticatedUserId) {
      return;
    }

    await this.syncCurrentStream(broadcasterUserId);

    const subscriptions: Subscription[] = [
      {
        type: 'stream.online',
        version: '1',
        condition: { broadcaster_user_id: broadcasterUserId },
      },
      {
        type: 'stream.offline',
        version: '1',
        condition: { broadcaster_user_id: broadcasterUserId },
      },
      {
        type: 'channel.follow',
        version: '2',
        condition: {
          broadcaster_user_id: broadcasterUserId,
          moderator_user_id: broadcasterUserId,
        },
      },
      {
        type: 'channel.subscribe',
        version: '1',
        condition: { broadcaster_user_id: broadcasterUserId },
      },
      {
        type: 'channel.cheer',
        version: '1',
        condition: { broadcaster_user_id: broadcasterUserId },
      },
      {
        type: 'channel.channel_points_custom_reward_redemption.add',
        version: '1',
        condition: { broadcaster_user_id: broadcasterUserId },
      },
      {
        type: 'channel.chat.message',
        version: '1',
        condition: {
          broadcaster_user_id: broadcasterUserId,
          user_id: authenticatedUserId,
        },
      },
    ];

    for (const subscription of subscriptions) {
      if (!this.connector.isReady) {
        return;
      }

      try {
        const result = await this.connector.client.subscriptions.subscribe(
          subscription.type,
          subscription.version,
          subscription.condition,
          sessionId,
        );
        const status = result.data?.[0]?.status;

        if (status !== 'enabled') {
          throw new Error(
            `Twitch returned subscription status "${status ?? 'missing'}".`,
          );
        }

        this.logger.log(
          `EventSub subscription enabled: ${subscription.type} v${subscription.version}`,
        );
      } catch (error) {
        const requiresLogin = await this.connector.handleError(error);
        this.logger.error(
          `EventSub subscription failed: ${subscription.type} v${subscription.version}`,
          error instanceof Error ? error.stack : String(error),
        );

        if (requiresLogin) {
          return;
        }
      }
    }
  }

  private async syncCurrentStream(broadcasterUserId: string): Promise<void> {
    try {
      const params = new URLSearchParams({ user_id: broadcasterUserId });
      const response = await this.connector.client.api.get<{
        data: Array<{ title: string; started_at: string }>;
      }>(`/streams?${params.toString()}`);
      const liveStream = response.data[0];

      if (!liveStream) {
        this.logger.log('Twitch channel is currently offline.');
        return;
      }

      const activeStream = await this.streamsService.findActive();

      if (activeStream) {
        this.logger.log(
          `Active StreamOps stream already exists: ${activeStream.id}`,
        );
        return;
      }

      const stream = await this.streamsService.create({
        title: liveStream.title,
        startedAt: liveStream.started_at,
      });

      this.logger.log(
        `Recovered active StreamOps stream for existing Twitch broadcast: ${stream.id}`,
      );
    } catch (error) {
      const requiresLogin = await this.connector.handleError(error);
      this.logger.error(
        'Failed to sync the current Twitch stream.',
        error instanceof Error ? error.stack : String(error),
      );

      if (!requiresLogin) {
        return;
      }
    }
  }

  private async handleNotification(
    subscriptionType: string,
    event: unknown,
    envelope: EventSubEnvelope,
  ): Promise<void> {
    if (!isRecord(event) || !envelope.metadata.message_id) {
      throw new Error('Invalid Twitch EventSub notification payload.');
    }

    const normalized = this.normalizer.normalize(
      envelope.metadata.message_id,
      subscriptionType,
      event,
    );

    if (subscriptionType === 'channel.chat.message') {
      await this.chatOverlayService.addMessage(
        normalized.payload,
        normalized.externalId,
      );
    }

    if (subscriptionType === 'stream.online') {
      await this.handleStreamOnline(normalized);
      return;
    }

    if (subscriptionType === 'stream.offline') {
      await this.handleStreamOffline(normalized);
      return;
    }

    if (
      subscriptionType === 'channel.channel_points_custom_reward_redemption.add'
    ) {
      await this.firstOverlayService.recordRedemption(normalized.payload);
      await this.pointPoolService.recordRedemption(normalized.payload);
    }

    const ingested = await this.ingestionService.ingest(
      normalized.type,
      normalized.externalId,
      normalized.payload,
    );

    if (subscriptionType !== 'channel.chat.message' || !ingested) {
      return;
    }

    const reply = await this.chatCommandDispatcher.dispatch(
      normalized.payload,
      ingested.streamId,
    );

    if (!reply || !this.connector.isReady) {
      return;
    }

    const broadcasterUserId = this.connector.getBroadcasterUserId();
    const senderId = this.connector.getAuthenticatedUserId();

    if (!broadcasterUserId || !senderId) {
      return;
    }

    const result = await this.connector.client.chat.sendMessage({
      broadcasterId: broadcasterUserId,
      senderId,
      message: reply,
    });

    if (!result.isSent) {
      throw new Error(
        `Twitch rejected the chat message: ${result.dropReason ?? 'unknown reason'}`,
      );
    }
  }

  private async handleStreamOnline(event: {
    type: string;
    externalId: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const broadcasterUserName = event.payload.broadcaster_user_name;
    const startedAt = event.payload.started_at;

    if (
      typeof event.payload.broadcaster_user_id !== 'string' ||
      typeof broadcasterUserName !== 'string' ||
      typeof startedAt !== 'string'
    ) {
      throw new Error('Invalid Twitch stream.online payload.');
    }

    const stream = await this.streamsService.create({
      title: broadcasterUserName,
      startedAt,
    });

    await this.eventsService.create({
      streamId: stream.id,
      type: event.type,
      externalId: event.externalId,
      payload: event.payload,
    });
  }

  private async handleStreamOffline(event: {
    type: string;
    externalId: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const stream = await this.streamsService.findActive();

    if (!stream) {
      throw new Error(
        'Received Twitch stream.offline without an active StreamOps stream.',
      );
    }

    await this.eventsService.create({
      streamId: stream.id,
      type: event.type,
      externalId: event.externalId,
      payload: event.payload,
    });

    await this.streamsService.end(stream.id);
  }
}
