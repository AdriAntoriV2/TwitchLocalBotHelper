import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { SecretEncryptionService } from '../common/security/secret-encryption.service.js';
import { TwitchConnectorService } from './twitch-connector.service.js';
import { TwitchOAuthClient } from './twitch-oauth.client.js';
import { TwitchOAuthStateService } from './twitch-oauth-state.service.js';
import type { TwitchShoutoutInfo } from './types/twitch-eventsub.types.js';
import { ChatOverlayService } from '../chat-overlay/chat-overlay.service.js';

interface TwitchEmote {
  id: string;
  name: string;
  format: string[];
}

interface TwitchUsersResponse {
  data: Array<{
    id: string;
    login: string;
    display_name: string;
  }>;
}

interface TwitchChannelsResponse {
  data: Array<{
    game_name: string;
    title: string;
  }>;
}

interface TwitchStreamsResponse {
  data: Array<{
    user_id: string;
  }>;
}

interface TwitchEmotesResponse {
  data?: Array<{
    id?: string;
    name?: string;
    format?: string[];
  }>;
  pagination?: {
    cursor?: string;
  };
}

@Injectable()
export class TwitchService implements OnModuleInit {
  private readonly logger = new Logger(TwitchService.name);

  constructor(
    private readonly oauth: TwitchOAuthClient,
    private readonly connector: TwitchConnectorService,
    private readonly prisma: PrismaService,
    private readonly encryption: SecretEncryptionService,
    private readonly oauthState: TwitchOAuthStateService,
    private readonly chatOverlay: ChatOverlayService,
  ) {}

  async onModuleInit(): Promise<void> {
    const account = await this.prisma.twitchAccount.findFirst({
      orderBy: { connectedAt: 'desc' },
      select: {
        twitchUserId: true,
        login: true,
      },
    });

    if (!account) {
      this.connector.requireLogin(
        new Error('No Twitch account is saved in StreamOps.'),
      );
      return;
    }

    try {
      await this.connector.connect(account.twitchUserId);
      await this.refreshChatEmotes(account.twitchUserId);
      this.logger.log(
        `Twitch startup reconnection completed for ${account.login}.`,
      );
    } catch (error) {
      if (!(await this.connector.handleError(error))) {
        this.logger.error(
          'Twitch startup connection failed; StreamOps remains available for reauthorization.',
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  async getAuthorizationUrl(): Promise<{ url: string; state: string }> {
    const state = await this.oauthState.create();
    return {
      url: this.oauth.getAuthorizationUrl(state),
      state,
    };
  }

  async handleOAuthCallback(code: string, state: string) {
    if (!code || !state) {
      throw new BadRequestException('Missing Twitch OAuth code or state');
    }

    const validState = await this.oauthState.consume(state);

    if (!validState) {
      throw new UnauthorizedException('Invalid or expired Twitch OAuth state');
    }

    const token = await this.oauth.exchangeCode(code);

    if (!token.access_token || !token.refresh_token) {
      throw new Error('Twitch OAuth did not return access and refresh tokens.');
    }

    const user = await this.oauth.getUser(token.access_token);

    if (!user) {
      throw new Error('Twitch OAuth did not return a user.');
    }

    const account = await this.prisma.twitchAccount.upsert({
      where: { twitchUserId: user.id },
      create: {
        twitchUserId: user.id,
        login: user.login,
        displayName: user.display_name,
        accessTokenEncrypted: this.encryption.encrypt(token.access_token),
        refreshTokenEncrypted: this.encryption.encrypt(token.refresh_token),
        accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1_000),
        scopes: token.scope,
      },
      update: {
        login: user.login,
        displayName: user.display_name,
        accessTokenEncrypted: this.encryption.encrypt(token.access_token),
        refreshTokenEncrypted: this.encryption.encrypt(token.refresh_token),
        accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1_000),
        scopes: token.scope,
        connectedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });

    await this.connector.connect(account.twitchUserId);
    await this.refreshChatEmotes(account.twitchUserId);

    return {
      id: account.id,
      twitchUserId: account.twitchUserId,
      login: account.login,
      displayName: account.displayName,
      scopes: account.scopes,
      connectedAt: account.connectedAt,
    };
  }

  async getShoutoutInfo(username: string): Promise<TwitchShoutoutInfo | null> {
    await this.connector.ensureAuthorized();

    const login = username.trim().replace(/^@/, '').toLowerCase();

    if (!/^[a-z0-9_]{1,25}$/.test(login)) {
      throw new BadRequestException('Invalid Twitch username.');
    }

    try {
      const userParams = new URLSearchParams({ login });
      const users = await this.connector.client.api.get<TwitchUsersResponse>(
        `/users?${userParams.toString()}`,
      );
      const user = users.data[0];

      if (!user) {
        return null;
      }

      const channelParams = new URLSearchParams({
        broadcaster_id: user.id,
      });
      const streamParams = new URLSearchParams({ user_id: user.id });
      const [channels, streams] = await Promise.all([
        this.connector.client.api.get<TwitchChannelsResponse>(
          `/channels?${channelParams.toString()}`,
        ),
        this.connector.client.api.get<TwitchStreamsResponse>(
          `/streams?${streamParams.toString()}`,
        ),
      ]);
      const channel = channels.data[0];

      return {
        displayName: user.display_name,
        login: user.login,
        category: channel?.game_name ?? '',
        title: channel?.title ?? '',
        isLive: streams.data.length > 0,
      };
    } catch (error) {
      await this.connector.handleError(error);
      throw error;
    }
  }

  private async refreshChatEmotes(broadcasterId: string): Promise<void> {
    const fetchEmotes = async (endpoint: string): Promise<TwitchEmote[]> => {
      const results: TwitchEmote[] = [];
      let cursor: string | undefined;

      do {
        const url = new URL(endpoint, 'https://api.twitch.tv');

        if (cursor) {
          url.searchParams.set('after', cursor);
        }

        let body: TwitchEmotesResponse;

        try {
          body = await this.connector.client.api.get<TwitchEmotesResponse>(
            `${url.pathname.replace('/helix', '')}${url.search}`,
          );
        } catch (error) {
          if (await this.connector.handleError(error)) {
            throw error;
          }

          this.logger.warn(
            `Twitch emote lookup failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          break;
        }

        for (const emote of body.data ?? []) {
          if (
            typeof emote.id === 'string' &&
            emote.id.length > 0 &&
            typeof emote.name === 'string' &&
            emote.name.length > 0
          ) {
            results.push({
              id: emote.id,
              name: emote.name,
              format: Array.isArray(emote.format) ? emote.format : ['static'],
            });
          }
        }

        cursor = body.pagination?.cursor;
      } while (cursor && this.connector.isReady);

      return results;
    };

    const channelParams = new URLSearchParams({
      broadcaster_id: broadcasterId,
    });
    const [globalEmotes, channelEmotes] = await Promise.all([
      fetchEmotes('/helix/chat/emotes/global'),
      fetchEmotes(`/helix/chat/emotes?${channelParams.toString()}`),
    ]);

    if (!this.connector.isReady) {
      return;
    }

    const emotes: Record<
      string,
      { id: string; format: 'static' | 'animated' }
    > = {};

    for (const emote of [...globalEmotes, ...channelEmotes]) {
      emotes[emote.name] = {
        id: emote.id,
        format: emote.format.includes('animated') ? 'animated' : 'static',
      };
    }

    if (Object.keys(emotes).length === 0) {
      this.logger.warn(
        'No Twitch emotes were loaded; keeping the existing cache.',
      );
      return;
    }

    await this.chatOverlay.setEmoteMap(emotes);
    this.logger.log(
      `Loaded ${globalEmotes.length} global and ${channelEmotes.length} channel emotes.`,
    );
  }
}
