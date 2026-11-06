import { describe, expect, it, vi } from 'vitest';
import { TwitchTokenStore } from './twitch-token.store.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { SecretEncryptionService } from '../common/security/secret-encryption.service.js';

describe('TwitchTokenStore', () => {
  const account = {
    id: 'account-1',
    accessTokenEncrypted: 'encrypted-access',
    refreshTokenEncrypted: 'encrypted-refresh',
    accessTokenExpiresAt: new Date('2026-11-04T00:00:00.000Z'),
    scopes: ['user:read:chat'],
  };

  it('loads and decrypts tokens from the latest account', async () => {
    const prisma = {
      twitchAccount: {
        findFirst: vi.fn().mockResolvedValue(account),
      },
    };
    const encryption = {
      decrypt: vi.fn((value: string) => `decrypted-${value}`),
    };
    const store = new TwitchTokenStore(
      prisma as unknown as PrismaService,
      encryption as unknown as SecretEncryptionService,
    );

    await expect(store.load()).resolves.toEqual({
      accessToken: 'decrypted-encrypted-access',
      refreshToken: 'decrypted-encrypted-refresh',
      expiresAt: account.accessTokenExpiresAt.getTime(),
      scopes: account.scopes,
    });
  });

  it('persists refreshed tokens encrypted in the account', async () => {
    const prisma = {
      twitchAccount: {
        findFirst: vi.fn().mockResolvedValue(account),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const encryption = {
      encrypt: vi.fn((value: string) => `encrypted-${value}`),
    };
    const store = new TwitchTokenStore(
      prisma as unknown as PrismaService,
      encryption as unknown as SecretEncryptionService,
    );
    const tokens = {
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresAt: Date.parse('2026-11-05T00:00:00.000Z'),
      scopes: ['user:read:chat', 'user:write:chat'],
    };

    await store.save(tokens);

    expect(prisma.twitchAccount.update).toHaveBeenCalledWith({
      where: { id: account.id },
      data: {
        accessTokenEncrypted: 'encrypted-new-access',
        refreshTokenEncrypted: 'encrypted-new-refresh',
        accessTokenExpiresAt: new Date(tokens.expiresAt),
        scopes: tokens.scopes,
        tokenVersion: { increment: 1 },
      },
    });
  });

  it('fails explicitly instead of saving tokens without an account', async () => {
    const prisma = {
      twitchAccount: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    };
    const encryption = { encrypt: vi.fn((value: string) => value) };
    const store = new TwitchTokenStore(
      prisma as unknown as PrismaService,
      encryption as unknown as SecretEncryptionService,
    );

    await expect(
      store.save({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: Date.now(),
        scopes: [],
      }),
    ).rejects.toThrow(
      'Cannot save Twitch tokens before a Twitch account is connected.',
    );
    expect(prisma.twitchAccount.update).not.toHaveBeenCalled();
  });
});
