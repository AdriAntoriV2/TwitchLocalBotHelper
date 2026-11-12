import { describe, expect, it, vi } from 'vitest';
import type { SecretEncryptionService } from '../common/security/secret-encryption.service.js';
import type { Twitch2PrismaService } from './twitch2-prisma.service.js';
import { Twitch2TokenStore } from './twitch2-token.store.js';

describe('Twitch2TokenStore', () => {
  it('stages login tokens and persists later refreshes encrypted', async () => {
    const account = {
      id: 'account-1',
      accessTokenEncrypted: 'stored-access',
      refreshTokenEncrypted: 'stored-refresh',
      accessTokenExpiresAt: new Date('2026-11-12T10:00:00.000Z'),
      scopes: ['user:read:chat'],
    };
    const prisma = {
      twitchAccount: {
        findFirst: vi.fn().mockResolvedValue(account),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const encryption = {
      decrypt: vi.fn((value: string) => `decrypted-${value}`),
      encrypt: vi.fn((value: string) => `encrypted-${value}`),
    };
    const store = new Twitch2TokenStore(
      prisma as unknown as Twitch2PrismaService,
      encryption as unknown as SecretEncryptionService,
    );
    const loginTokens = {
      accessToken: 'login-access',
      refreshToken: 'login-refresh',
      expiresAt: Date.parse('2026-11-13T10:00:00.000Z'),
      scopes: ['user:read:chat'],
    };

    store.beginLogin();
    await store.save(loginTokens);
    await expect(store.load()).resolves.toEqual(loginTokens);
    expect(prisma.twitchAccount.findFirst).not.toHaveBeenCalled();

    store.finishLogin();
    await store.save({
      ...loginTokens,
      accessToken: 'rotated-access',
      refreshToken: 'rotated-refresh',
    });

    expect(prisma.twitchAccount.update).toHaveBeenCalledWith({
      where: { id: account.id },
      data: {
        accessTokenEncrypted: 'encrypted-rotated-access',
        refreshTokenEncrypted: 'encrypted-rotated-refresh',
        accessTokenExpiresAt: new Date(loginTokens.expiresAt),
        scopes: loginTokens.scopes,
        tokenVersion: { increment: 1 },
      },
    });

    await expect(store.load()).resolves.toEqual({
      accessToken: 'decrypted-stored-access',
      refreshToken: 'decrypted-stored-refresh',
      expiresAt: account.accessTokenExpiresAt.getTime(),
      scopes: ['user:read:chat'],
    });
  });
});
