import { Module } from '@nestjs/common';
import { SecurityModule } from '../common/security/security.module.js';
import { Twitch2Controller } from './twitch2.controller.js';
import { Twitch2ConnectionService } from './twitch2-connection.service.js';
import { Twitch2PrismaService } from './twitch2-prisma.service.js';
import { Twitch2TokenStore } from './twitch2-token.store.js';

@Module({
  imports: [SecurityModule],
  controllers: [Twitch2Controller],
  providers: [
    Twitch2ConnectionService,
    Twitch2PrismaService,
    Twitch2TokenStore,
  ],
  exports: [Twitch2ConnectionService],
})
export class Twitch2Module {}
