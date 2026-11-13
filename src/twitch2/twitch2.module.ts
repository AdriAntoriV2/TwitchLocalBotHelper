import { Module } from '@nestjs/common';
import { SecurityModule } from '../common/security/security.module.js';
import { Twitch2Controller } from './twitch2.controller.js';
import { Twitch2ConnectionService } from './twitch2-connection.service.js';
import { Twitch2EventSubService } from './twitch2-eventsub.service.js';
import { Twitch2EventNormalizer } from './twitch2-event-normalizer.service.js';
import { Twitch2EventIngestionService } from './twitch2-event-ingestion.service.js';
import { Twitch2PrismaService } from './twitch2-prisma.service.js';
import { Twitch2TokenStore } from './twitch2-token.store.js';
import { EventsModule } from '../events/events.module.js';
import { StreamsModule } from '../streams/streams.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { ChatCommandsModule } from '../chat-commands/chat-commands.module.js';
import { PointPoolModule } from '../point-pool/point-pool.module.js';
import { FirstOverlayModule } from '../first-overlay/first-overlay.module.js';
import { ChatOverlayModule } from '../chat-overlay/chat-overlay.module.js';

@Module({
  imports: [
    SecurityModule,
    EventsModule,
    StreamsModule,
    CommandsModule,
    ChatCommandsModule,
    PointPoolModule,
    FirstOverlayModule,
    ChatOverlayModule,
  ],
  controllers: [Twitch2Controller],
  providers: [
    Twitch2ConnectionService,
    Twitch2EventSubService,
    Twitch2EventNormalizer,
    Twitch2EventIngestionService,
    Twitch2PrismaService,
    Twitch2TokenStore,
  ],
  exports: [Twitch2ConnectionService],
})
export class Twitch2Module {}