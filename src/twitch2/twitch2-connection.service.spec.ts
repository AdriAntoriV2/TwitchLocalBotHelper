import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { SecretEncryptionService } from '../common/security/secret-encryption.service.js';
import type { TwitchTokens } from 'streamops-twitch-connector';
import { Twitch2ConnectionService } from './twitch2-connection.service.js';
import type { Twitch2PrismaService } from './twitch2-prisma.service.js';
import type { Twitch2TokenStore } from './twitch2-token.store.js';

const connectorMocks = vi.hoisted(() => ({
  startLogin: vi.fn(),
  completeLogin: vi.fn(),
  getValidatedToken: vi.fn(),
  onAuthError: vi.fn(),
  dispose: vi.fn(),
  apiGet: vi.fn(),
}));

vi.mock('streamops-twitch-connector', () => ({
  TwitchClient: vi.fn(function TwitchClientMock() {
    return {
      tokens: {
        startLogin: connectorMocks.startLogin,
        completeLogin: connectorMocks.completeLogin,
        getValidatedToken: connectorMocks.getValidatedToken,
        onAuthError: connectorMocks.onAuthError,
        dispose: connectorMocks.dispose,
      },
      api: { get: connectorMocks.apiGet },
    };
  }),
  TwitchError: class TwitchError extends Error {},
}));

describe('Twitch2ConnectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes Device Code login, persists encrypted tokens, and connects', async () => {
    const login = {
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://www.twitch.tv/activate',
      expiresIn: 600,
      interval: 5,
    };
    const tokens: TwitchTokens = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.parse('2026-11-12T10:00:00.000Z'),
      scopes: ['user:read:chat'],
    };
    let stagedTokens: TwitchTokens | null = null;
    const tokenStore = {
      beginLogin: vi.fn(),
      finishLogin: vi.fn(),
      cancelLogin: vi.fn(),
      load: vi.fn(async () => stagedTokens),
      save: vi.fn(async (value: TwitchTokens) => {
        stagedTokens = value;
      }),
    };
    const prisma = {
      twitchAccount: {
        upsert: vi.fn().mockResolvedValue({
          twitchUserId: '123',
          login: 'streamer',
        }),
      },
    };
    const encryption = {
      encrypt: vi.fn((value: string) => `encrypted-${value}`),
    };
    connectorMocks.startLogin.mockResolvedValue(login);
    connectorMocks.completeLogin.mockImplementation(async () => {
      await tokenStore.save(tokens);
    });
    connectorMocks.getValidatedToken.mockResolvedValue({ user_id: '123' });
    connectorMocks.apiGet.mockResolvedValue({
      data: [{ id: '123', login: 'streamer', display_name: 'Streamer' }],
    });
    connectorMocks.onAuthError.mockReturnValue(vi.fn());

    const service = new Twitch2ConnectionService(
      {
        getOrThrow: (key: string) =>
          key === 'twitch.scopes' ? ['user:read:chat'] : 'client-id',
      } as unknown as ConfigService,
      tokenStore as unknown as Twitch2TokenStore,
      prisma as unknown as Twitch2PrismaService,
      encryption as unknown as SecretEncryptionService,
    );

    await expect(service.startDeviceLogin()).resolves.toEqual(login);
    await vi.waitFor(() => {
      expect(service.getDeviceLoginStatus()).toEqual({ status: 'connected' });
    });

    expect(tokenStore.beginLogin).toHaveBeenCalledOnce();
    expect(tokenStore.finishLogin).toHaveBeenCalledOnce();
    expect(prisma.twitchAccount.upsert).toHaveBeenCalledWith({
      where: { twitchUserId: '123' },
      create: {
        twitchUserId: '123',
        login: 'streamer',
        displayName: 'Streamer',
        accessTokenEncrypted: 'encrypted-access-token',
        refreshTokenEncrypted: 'encrypted-refresh-token',
        accessTokenExpiresAt: new Date(tokens.expiresAt),
        scopes: tokens.scopes,
      },
      update: {
        login: 'streamer',
        displayName: 'Streamer',
        accessTokenEncrypted: 'encrypted-access-token',
        refreshTokenEncrypted: 'encrypted-refresh-token',
        accessTokenExpiresAt: new Date(tokens.expiresAt),
        scopes: tokens.scopes,
        connectedAt: expect.any(Date),
        tokenVersion: { increment: 1 },
      },
    });
    expect(service.getAuthenticatedUserId()).toBe('123');

    await service.onModuleDestroy();
  });
});
