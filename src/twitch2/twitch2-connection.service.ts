import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TwitchClient,
  TwitchError,
  type TwitchValidatedToken,
} from 'streamops-twitch-connector';
import { SecretEncryptionService } from '../common/security/secret-encryption.service.js';
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

  async onModuleDestroy(): Promise<void> {
    this.loginAbortController?.abort();
    await this.loginPromise;
    this.removeAuthErrorListener();
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
