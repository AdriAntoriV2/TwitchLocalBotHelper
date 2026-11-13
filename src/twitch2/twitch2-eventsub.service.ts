import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { EventSubEnvelope } from 'streamops-twitch-connector';
import { Twitch2ConnectionService } from './twitch2-connection.service.js';
import { Twitch2EventNormalizer } from './twitch2-event-normalizer.service.js';
import { Twitch2EventIngestionService } from './twitch2-event-ingestion.service.js';
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
export class Twitch2EventSubService implements OnModuleDestroy {
  private readonly logger = new Logger(Twitch2EventSubService.name);
  private readonly removeSessionListener: () => void;
  private readonly removeNotificationListener: () => void;
  private offlineNoticeLogged = false;

  constructor(
    private readonly connection: Twitch2ConnectionService,
    private readonly streamsService: StreamsService,
    private readonly eventsService: EventsService,
    private readonly normalizer: Twitch2EventNormalizer,
    private readonly ingestionService: Twitch2EventIngestionService,
    private readonly chatCommandDispatcher: ChatCommandDispatcher,
    private readonly pointPoolService: PointPoolService,
    private readonly firstOverlayService: FirstOverlayService,
    private readonly chatOverlayService: ChatOverlayService,
  ) {
    this.removeSessionListener = this.connection.client.eventSub.onSession(
      async (sessionId, isReconnectHandover) => {
        if (isReconnectHandover || !this.connection.isReady) {
          return;
        }

        await this.handleSession(sessionId);
      },
    );

    this.removeNotificationListener =
      this.connection.client.eventSub.onNotification(
        async (type, event, envelope) => {
          if (!this.connection.isReady) {
            return;
          }

          try {
            await this.handleNotification(type, event, envelope);
          } catch (error) {
            this.logger.error(
              `Failed to process Twitch EventSub notification: ${type}`,
              error instanceof Error ? error.stack : String(error),
            );
          }
        },
      );
  }

  async onModuleDestroy(): Promise<void> {
    this.removeSessionListener();
    this.removeNotificationListener();
  }

  private async handleSession(sessionId: string): Promise<void> {
    const broadcasterUserId = this.connection.getBroadcasterUserId();
    const authenticatedUserId = this.connection.getAuthenticatedUserId();

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
      if (!this.connection.isReady) {
        return;
      }

      try {
        const result =
          await this.connection.client.subscriptions.subscribe(
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
      } catch (error) {
        this.logger.error(
          `EventSub subscription failed: ${subscription.type} v${subscription.version}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private async syncCurrentStream(broadcasterUserId: string): Promise<void> {
    try {
      const params = new URLSearchParams({ user_id: broadcasterUserId });
      const response = await this.connection.client.api.get<{
        data: Array<{ title: string; started_at: string }>;
      }>(`/streams?${params.toString()}`);

      const liveStream = response.data[0];

      if (!liveStream) {
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
      this.logger.error(
        'Failed to sync the current Twitch stream.',
        error instanceof Error ? error.stack : String(error),
      );
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
      subscriptionType ===
      'channel.channel_points_custom_reward_redemption.add'
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

    if (!reply || !this.connection.isReady) {
      return;
    }

    const broadcasterUserId = this.connection.getBroadcasterUserId();
    const senderId = this.connection.getAuthenticatedUserId();

    if (!broadcasterUserId || !senderId) {
      return;
    }

    const result = await this.connection.client.chat.sendMessage({
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

    this.offlineNoticeLogged = false;
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