import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { TwitchOAuthClient } from './twitch-oauth.client.js';

describe('TwitchOAuthClient', () => {
  function createClient(
    redirectUri: string,
    port = new URL(redirectUri).port || '80',
  ) {
    const values: Record<string, unknown> = {
      'twitch.clientId': 'client-id',
      'twitch.clientSecret': 'client-secret',
      'twitch.redirectUri': redirectUri,
      'twitch.scopes': ['user:read:chat'],
      'server.port': port,
    };
    const config = {
      getOrThrow: vi.fn((key: string) => {
        const value = values[key];

        if (value === undefined) {
          throw new Error(`Missing config: ${key}`);
        }

        return value;
      }),
    };

    return new TwitchOAuthClient(config as unknown as ConfigService);
  }

  it('uses the exact registered redirect URI for local OAuth', () => {
    const client = createClient(
      'http://localhost:3000/api/twitch/oauth/callback',
    );

    expect(client.getLoginUrl()).toBe('http://localhost:3000/api/twitch/oauth');

    const authorization = new URL(client.getAuthorizationUrl('state'));
    expect(authorization.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/twitch/oauth/callback',
    );
  });

  it('does not silently rewrite the registered callback port', () => {
    const client = createClient(
      'http://localhost:3000/api/twitch/oauth/callback',
      6769,
    );

    expect(client.getLoginUrl()).toBe('http://localhost:3000/api/twitch/oauth');

    const authorization = new URL(client.getAuthorizationUrl('state'));
    expect(authorization.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/twitch/oauth/callback',
    );
  });

  it('does not rewrite non-local OAuth redirect origins', () => {
    const client = createClient(
      'https://streamops.example.com/api/twitch/oauth/callback',
    );

    expect(client.getLoginUrl()).toBe(
      'https://streamops.example.com/api/twitch/oauth',
    );
    const authorization = new URL(client.getAuthorizationUrl('state'));
    expect(authorization.searchParams.get('redirect_uri')).toBe(
      'https://streamops.example.com/api/twitch/oauth/callback',
    );
  });
});
