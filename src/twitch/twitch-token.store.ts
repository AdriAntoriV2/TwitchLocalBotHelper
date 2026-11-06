import { Injectable } from '@nestjs/common';
import type {
  TwitchTokenStore as ConnectorTokenStore,
  TwitchTokens,
} from 'streamops-twitch-connector';
import { PrismaService } from '../database/prisma.service.js';
import { SecretEncryptionService } from '../common/security/secret-encryption.service.js';

@Injectable()
export class TwitchTokenStore implements ConnectorTokenStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: SecretEncryptionService,
  ) {}

  async load(): Promise<TwitchTokens | null> {
    const account = await this.findLatestAccount();

    if (!account) {
      return null;
    }

    return {
      accessToken: this.encryption.decrypt(account.accessTokenEncrypted),
      refreshToken: this.encryption.decrypt(account.refreshTokenEncrypted),
      expiresAt: account.accessTokenExpiresAt.getTime(),
      scopes: account.scopes,
    };
  }

  async save(tokens: TwitchTokens): Promise<void> {
    const account = await this.findLatestAccount();

    if (!account) {
      throw new Error(
        'Cannot save Twitch tokens before a Twitch account is connected.',
      );
    }

    await this.prisma.twitchAccount.update({
      where: { id: account.id },
      data: {
        accessTokenEncrypted: this.encryption.encrypt(tokens.accessToken),
        refreshTokenEncrypted: this.encryption.encrypt(tokens.refreshToken),
        accessTokenExpiresAt: new Date(tokens.expiresAt),
        scopes: tokens.scopes,
        tokenVersion: { increment: 1 },
      },
    });
  }

  async clear(): Promise<void> {
    const account = await this.findLatestAccount();

    if (account) {
      await this.prisma.twitchAccount.delete({ where: { id: account.id } });
    }
  }

  private findLatestAccount() {
    return this.prisma.twitchAccount.findFirst({
      orderBy: { connectedAt: 'desc' },
      select: {
        id: true,
        accessTokenEncrypted: true,
        refreshTokenEncrypted: true,
        accessTokenExpiresAt: true,
        scopes: true,
      },
    });
  }
}
