import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  TwitchTokenResponse,
  TwitchUser,
} from './types/twitch-eventsub.types.js';

@Injectable()
export class TwitchOAuthClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly loginUrl: string;

  constructor(private readonly config: ConfigService) {
    this.clientId = config.getOrThrow<string>('twitch.clientId');
    this.clientSecret = config.getOrThrow<string>('twitch.clientSecret');
    this.redirectUri = config.getOrThrow<string>('twitch.redirectUri');
    this.loginUrl = new URL(
      '/api/twitch/oauth',
      new URL(this.redirectUri).origin,
    ).toString();
  }

  getLoginUrl(): string {
    return this.loginUrl;
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.config.getOrThrow<string[]>('twitch.scopes').join(' '),
      state,
    });

    return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<TwitchTokenResponse> {
    const response = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Twitch OAuth token exchange failed: ${response.status} ${body}`,
      );
    }

    return (await response.json()) as TwitchTokenResponse;
  }

  async getUser(accessToken: string): Promise<TwitchUser | null> {
    const response = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': this.clientId,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Twitch user request failed: ${response.status} ${body}`);
    }

    const body = (await response.json()) as { data: TwitchUser[] };
    return body.data[0] ?? null;
  }
}
