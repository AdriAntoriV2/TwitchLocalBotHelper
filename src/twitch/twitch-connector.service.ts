import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TwitchClient,
  TwitchError,
  type TwitchValidatedToken,
} from 'streamops-twitch-connector';
import { TwitchOAuthClient } from './twitch-oauth.client.js';
import { TwitchTokenStore } from './twitch-token.store.js';

type TwitchConnectionState = 'login-required' | 'ready';

@Injectable()
export class TwitchConnectorService implements OnModuleDestroy {
  private readonly logger = new Logger(TwitchConnectorService.name);
  readonly client: TwitchClient;
  private readonly loginUrl: string;
  private state: TwitchConnectionState = 'login-required';
  private loginNoticeShown = false;
  private broadcasterUserId: string | null = null;
  private authenticatedUserId: string | null = null;
  private readonly removeAuthErrorListener: () => void;

  constructor(
    config: ConfigService,
    tokenStore: TwitchTokenStore,
    oauth: TwitchOAuthClient,
  ) {
    this.loginUrl = oauth.getLoginUrl();
    this.client = new TwitchClient({
      clientId: config.getOrThrow<string>('twitch.clientId'),
      clientSecret: config.getOrThrow<string>('twitch.clientSecret'),
      scopes: config.getOrThrow<string[]>('twitch.scopes'),
      tokenStore,
    });

    this.removeAuthErrorListener = this.client.tokens.onAuthError((error) => {
      if (this.isAuthorizationError(error)) {
        this.requireLogin(error);
      } else {
        this.logger.error(
          'Twitch token validation failed due to a non-authorization error; login remains available if Twitch later rejects the token.',
          error.stack,
        );
      }
    });
  }

  get isReady(): boolean {
    return this.state === 'ready';
  }

  requireLogin(error: unknown): void {
    this.transitionToLoginRequired(error);
  }

  async connect(broadcasterUserId: string): Promise<void> {
    try {
      const token = await this.client.tokens.getValidatedToken();
      const authenticatedUserId = this.getUserId(token);

      if (authenticatedUserId !== broadcasterUserId) {
        throw new Error(
          'The authenticated Twitch account does not match the saved broadcaster.',
        );
      }

      this.broadcasterUserId = broadcasterUserId;
      this.authenticatedUserId = authenticatedUserId;
      this.state = 'ready';
      this.loginNoticeShown = false;
      await this.client.connectEventSub();
      this.logger.log(`Twitch connected as user ${authenticatedUserId}.`);
    } catch (error) {
      if (this.isAuthorizationError(error)) {
        this.transitionToLoginRequired(error);
      } else {
        this.logger.error(
          'Twitch connection failed before authorization could be validated.',
          error instanceof Error ? error.stack : String(error),
        );
      }

      throw error;
    }
  }

  async ensureAuthorized(): Promise<void> {
    if (!this.isReady) {
      throw new ServiceUnavailableException(
        'Twitch authorization is required. Open the login URL shown in the server console.',
      );
    }
  }

  async handleError(error: unknown): Promise<boolean> {
    if (!this.isAuthorizationError(error)) {
      return false;
    }

    this.requireLogin(error);
    return true;
  }

  getBroadcasterUserId(): string | null {
    return this.broadcasterUserId;
  }

  getAuthenticatedUserId(): string | null {
    return this.authenticatedUserId;
  }

  async onModuleDestroy(): Promise<void> {
    this.removeAuthErrorListener();
    this.client.tokens.dispose();
    await this.client.disconnectEventSub();
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

  private transitionToLoginRequired(error: unknown): void {
    const wasReady = this.state === 'ready';
    this.state = 'login-required';
    this.broadcasterUserId = null;
    this.authenticatedUserId = null;

    if (wasReady) {
      void this.client
        .disconnectEventSub()
        .catch((disconnectError: unknown) => {
          this.logger.error(
            'Failed to stop Twitch EventSub after authorization failed.',
            disconnectError instanceof Error
              ? disconnectError.stack
              : String(disconnectError),
          );
        });
    }

    if (this.loginNoticeShown) {
      return;
    }

    this.loginNoticeShown = true;
    this.logger.error(
      [
        'Twitch login is required. Twitch processing is paused.',
        `Please log in again at ${this.loginUrl}`,
        'After authorization completes, StreamOps will reconnect automatically.',
        error instanceof Error ? `Reason: ${error.message}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
}
