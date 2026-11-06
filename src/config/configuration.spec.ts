import { afterEach, describe, expect, it, vi } from 'vitest';
import configuration from './configuration.js';

describe('configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses a local Twitch callback port as the application listener port', () => {
    vi.stubEnv('PORT', '6769');
    vi.stubEnv(
      'TWITCH_REDIRECT_URI',
      'http://localhost:3000/api/twitch/oauth/callback',
    );

    const config = configuration();

    expect(config.server.port).toBe(3000);
    expect(config.twitch.redirectUri).toBe(
      'http://localhost:3000/api/twitch/oauth/callback',
    );
  });

  it('keeps the configured application port for non-local callback URLs', () => {
    vi.stubEnv('PORT', '6769');
    vi.stubEnv(
      'TWITCH_REDIRECT_URI',
      'https://streamops.example.com/api/twitch/oauth/callback',
    );

    expect(configuration().server.port).toBe(6769);
  });
});
