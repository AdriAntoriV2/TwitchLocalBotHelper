import { afterEach, describe, expect, it, vi } from 'vitest';
import configuration from './configuration.js';

describe('configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the configured application port', () => {
    vi.stubEnv('PORT', '6769');

    const config = configuration();

    expect(config.server.port).toBe(6769);
    expect(config.twitch).not.toHaveProperty('redirectUri');
  });
});
