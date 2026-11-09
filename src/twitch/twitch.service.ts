import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { SecretEncryptionService } from '../common/security/secret-encryption.service.js';
import { TwitchConnectorService } from './twitch-connector.service.js';
import { TwitchTokenStore } from './twitch-token.store.js';
import type { TwitchShoutoutInfo } from './types/twitch-eventsub.types.js';
import { ChatOverlayService } from '../chat-overlay/chat-overlay.service.js';

interface TwitchEmote {
  id: string;
  name: string;
  format: string[];
}

interface TwitchUserResponse {
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

export interface TwitchDeviceLogin {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

@Injectable()
export class TwitchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TwitchService.name);
  private loginStatus: 'login-required' | 'pending' | 'connected' | 'failed' =
    'login-required';
  private loginError: string | null = null;
  private loginStarting = false;
  private loginPromise: Promise<void> | null = null;
  private loginAbortController: AbortController | null = null;

  constructor(
    private readonly connector: TwitchConnectorService,
    private readonly prisma: PrismaService,
    private readonly encryption: SecretEncryptionService,
    private readonly tokenStore: TwitchTokenStore,
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
      this.loginStatus = 'connected';
      this.logger.log(
        `Twitch startup reconnection completed for ${account.login}.`,
      );
    } catch (error) {
      this.loginStatus = 'login-required';
      if (!(await this.connector.handleError(error))) {
        this.logger.error(
          'Twitch startup connection failed; StreamOps remains available for reauthorization.',
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.loginAbortController?.abort();
    await this.loginPromise;
  }

  async startDeviceLogin(): Promise<TwitchDeviceLogin> {
    if (this.loginStarting || this.loginPromise) {
      throw new ConflictException(
        'Twitch device login is already in progress.',
      );
    }

    if (this.connector.isReady) {
      throw new ConflictException('Twitch is already connected.');
    }

    this.loginStarting = true;
    this.tokenStore.beginLogin();

    try {
      const login = await this.connector.client.tokens.startLogin();
      this.loginStatus = 'pending';
      this.loginError = null;
      this.loginAbortController = new AbortController();
      this.loginPromise = this.completeDeviceLogin(
        this.loginAbortController.signal,
      ).finally(() => {
        this.loginPromise = null;
        this.loginAbortController = null;
      });

      return login;
    } catch (error) {
      this.tokenStore.cancelLogin();
      throw error;
    } finally {
      this.loginStarting = false;
    }
  }

  getDeviceLoginStatus(): {
    status: 'login-required' | 'pending' | 'connected' | 'failed';
    error?: string;
  } {
    if (this.connector.isReady) {
      return { status: 'connected' };
    }

    return this.loginError
      ? { status: this.loginStatus, error: this.loginError }
      : { status: this.loginStatus };
  }

  async getShoutoutInfo(username: string): Promise<TwitchShoutoutInfo | null> {
    await this.connector.ensureAuthorized();

    const login = username.trim().replace(/^@/, '').toLowerCase();

    if (!/^[a-z0-9_]{1,25}$/.test(login)) {
      throw new BadRequestException('Invalid Twitch username.');
    }

    try {
      const userParams = new URLSearchParams({ login });
      const users = await this.connector.client.api.get<TwitchUserResponse>(
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

  private async completeDeviceLogin(signal: AbortSignal): Promise<void> {
    try {
      await this.connector.client.tokens.completeLogin(signal);

      const response =
        await this.connector.client.api.get<TwitchUserResponse>('/users');
      const user = response.data[0];

      if (!user) {
        throw new Error(
          'Twitch device login did not return an authenticated user.',
        );
      }

      const tokens = await this.tokenStore.load();

      if (!tokens) {
        throw new Error('Twitch device login completed without saved tokens.');
      }

      const account = await this.prisma.twitchAccount.upsert({
        where: { twitchUserId: user.id },
        create: {
          twitchUserId: user.id,
          login: user.login,
          displayName: user.display_name,
          accessTokenEncrypted: this.encryption.encrypt(tokens.accessToken),
          refreshTokenEncrypted: this.encryption.encrypt(tokens.refreshToken),
          accessTokenExpiresAt: new Date(tokens.expiresAt),
          scopes: tokens.scopes,
        },
        update: {
          login: user.login,
          displayName: user.display_name,
          accessTokenEncrypted: this.encryption.encrypt(tokens.accessToken),
          refreshTokenEncrypted: this.encryption.encrypt(tokens.refreshToken),
          accessTokenExpiresAt: new Date(tokens.expiresAt),
          scopes: tokens.scopes,
          connectedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      });

      this.tokenStore.finishLogin();
      await this.connector.connect(account.twitchUserId);
      await this.refreshChatEmotes(account.twitchUserId);
      this.loginStatus = 'connected';
      this.logger.log(`Twitch device login completed for ${account.login}.`);
    } catch (error) {
      this.tokenStore.cancelLogin();

      if (signal.aborted) {
        return;
      }

      await this.connector.handleError(error);
      this.loginStatus = 'failed';
      this.loginError =
        'Twitch device login failed. Check the server logs and retry.';
      this.logger.error(
        'Twitch device login failed.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
