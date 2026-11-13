import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TwitchClient,
  TwitchError,
  type TwitchValidatedToken,
} from 'streamops-twitch-connector';
import { SecretEncryptionService } from '../common/security/secret-encryption.service.js';
import { ChatOverlayService } from '../chat-overlay/chat-overlay.service.js';
import { Twitch2PrismaService } from './twitch2-prisma.service.js';
import { Twitch2TokenStore } from './twitch2-token.store.js';

export interface Twitch2DeviceLogin {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface Twitch2DeviceLoginStatus {
  status: 'login-required' | 'pending' | 'connected' | 'failed';
  error?: string;
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

interface TwitchEmote {
  id: string;
  name: string;
  format: string[];
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

export interface Twitch2ShoutoutInfo {
  displayName: string;
  login: string;
  category: string;
  title: string;
  isLive: boolean;
}

@Injectable()
export class Twitch2ConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Twitch2ConnectionService.name);
  readonly client: TwitchClient;
  private status: Twitch2DeviceLoginStatus['status'] = 'login-required';
  private loginError: string | null = null;
  private loginStarting = false;
  private loginPromise: Promise<void> | null = null;
  private loginAbortController: AbortController | null = null;
  private authenticatedUserId: string | null = null;
  private readonly removeAuthErrorListener: () => void;

  constructor(
    config: ConfigService,
    private readonly tokenStore: Twitch2TokenStore,
    private readonly prisma: Twitch2PrismaService,
    private readonly encryption: SecretEncryptionService,
    private readonly chatOverlay: ChatOverlayService,
  ) {
    this.client = new TwitchClient({
      clientId: config.getOrThrow<string>('twitch.clientId'),
      scopes: config.getOrThrow<string[]>('twitch.scopes'),
      tokenStore,
    });

    this.removeAuthErrorListener = this.client.tokens.onAuthError((error) => {
      if (this.isAuthorizationError(error)) {
        this.requireLogin();
      } else {
        this.logger.error(
          'Twitch token refresh failed; the connection remains available for retry.',
          error instanceof Error ? error.stack : String(error),
        );
      }
    });
  }

  get isReady(): boolean {
    return this.status === 'connected';
  }

  async onModuleInit(): Promise<void> {
    const account = await this.prisma.twitchAccount.findFirst({
      orderBy: { connectedAt: 'desc' },
      select: {
        twitchUserId: true,
        login: true,
      },
    });

    if (!account) {
      return;
    }

    try {
      await this.connect(account.twitchUserId);
      this.logger.log(`Twitch reconnected as ${account.login}.`);
    } catch (error) {
      this.logger.error(
        'Twitch startup connection failed.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async startDeviceLogin(): Promise<Twitch2DeviceLogin> {
    if (this.loginStarting || this.loginPromise) {
      throw new ConflictException(
        'Twitch device login is already in progress.',
      );
    }

    if (this.isReady) {
      throw new ConflictException('Twitch is already connected.');
    }

    this.loginStarting = true;
    this.tokenStore.beginLogin();

    try {
      const login = await this.client.tokens.startLogin();
      this.status = 'pending';
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

  getDeviceLoginStatus(): Twitch2DeviceLoginStatus {
    return this.loginError
      ? { status: this.status, error: this.loginError }
      : { status: this.status };
  }

  async connect(twitchUserId: string): Promise<void> {
    try {
      const token = await this.client.tokens.getValidatedToken();
      const authenticatedUserId = this.getUserId(token);

      if (authenticatedUserId !== twitchUserId) {
        throw new Error(
          'The authenticated Twitch account does not match the saved account.',
        );
      }

      this.authenticatedUserId = authenticatedUserId;
      this.status = 'connected';
      this.loginError = null;

      await this.client.connectEventSub();
      await this.refreshChatEmotes(authenticatedUserId);

      this.logger.log(`Twitch connected as user ${authenticatedUserId}.`);
    } catch (error) {
      if (this.isAuthorizationError(error)) {
        this.requireLogin();
      }

      throw error;
    }
  }

  getAuthenticatedUserId(): string | null {
    return this.authenticatedUserId;
  }

  getBroadcasterUserId(): string | null {
    return this.authenticatedUserId;
  }

  async getShoutoutInfo(username: string): Promise<Twitch2ShoutoutInfo | null> {
    await this.ensureAuthorized();

    const login = username.trim().replace(/^@/, '').toLowerCase();

    if (!/^[a-z0-9_]{1,25}$/.test(login)) {
      throw new BadRequestException('Invalid Twitch username.');
    }

    const userParams = new URLSearchParams({ login });
    const users = await this.client.api.get<TwitchUserResponse>(
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
      this.client.api.get<TwitchChannelsResponse>(
        `/channels?${channelParams.toString()}`,
      ),
      this.client.api.get<TwitchStreamsResponse>(
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
  }

  async ensureAuthorized(): Promise<void> {
    if (!this.isReady) {
      throw new ServiceUnavailableException('Twitch is not connected.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.loginAbortController?.abort();
    await this.loginPromise;
    this.removeAuthErrorListener();

    try {
      await this.client.disconnectEventSub();
    } catch (error) {
      this.logger.error(
        'Failed to stop Twitch EventSub.',
        error instanceof Error ? error.stack : String(error),
      );
    }

    this.client.tokens.dispose();
  }

  private async completeDeviceLogin(signal: AbortSignal): Promise<void> {
    try {
      await this.client.tokens.completeLogin(signal);

      if (signal.aborted) {
        return;
      }

      const response = await this.client.api.get<TwitchUserResponse>('/users');
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
      await this.connect(account.twitchUserId);
      this.logger.log(`Twitch device login completed for ${account.login}.`);
    } catch (error) {
      this.tokenStore.cancelLogin();

      if (signal.aborted) {
        return;
      }

      this.status = 'failed';
      this.loginError =
        'Twitch device login failed. Check the server logs and retry.';
      this.logger.error(
        'Twitch device login failed.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private requireLogin(): void {
    this.status = 'login-required';
    this.authenticatedUserId = null;
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
          body = await this.client.api.get<TwitchEmotesResponse>(
            `${url.pathname.replace('/helix', '')}${url.search}`,
          );
        } catch (error) {
          if (this.isAuthorizationError(error)) {
            this.requireLogin();
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
      } while (cursor && this.isReady);

      return results;
    };

    const channelParams = new URLSearchParams({
      broadcaster_id: broadcasterId,
    });
    const [globalEmotes, channelEmotes] = await Promise.all([
      fetchEmotes('/helix/chat/emotes/global'),
      fetchEmotes(`/helix/chat/emotes?${channelParams.toString()}`),
    ]);

    if (!this.isReady) {
      return;
    }

    const emotes: Record<string, { id: string; format: 'static' | 'animated' }> =
      {};

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

  private getUserId(token: TwitchValidatedToken): string {
    if (!token.user_id) {
      throw new Error('Twitch token validation did not return a user ID.');
    }

    return token.user_id;
  }

  private isAuthorizationError(error: unknown): boolean {
    if (error instanceof TwitchError) {
      return (
        error.statusCode === 401 ||
        error.errorCode === 'reauthentication_required'
      );
    }

    return (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      error.statusCode === 401
    );
  }
}
