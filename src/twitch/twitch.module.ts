import { Module } from '@nestjs/common';
import { TwitchController } from './twitch.controller.js';
import { TwitchService } from './twitch.service.js';
import { TwitchEventSubService } from './twitch-eventsub.service.js';
import { TwitchConnectorService } from './twitch-connector.service.js';
import { TwitchOAuthClient } from './twitch-oauth.client.js';
import { TwitchTokenStore } from './twitch-token.store.js';
import { TwitchEventNormalizer } from './twitch-event-normalizer.service.js';
import { StreamsModule } from '../streams/streams.module.js';
import { EventsModule } from '../events/events.module.js';
import { TwitchEventIngestionService } from './twitch-event-ingestion.service.js';
import { CommandsModule } from '../commands/commands.module.js';
import { SecurityModule } from '../common/security/security.module.js';
import { TwitchOAuthStateService } from './twitch-oauth-state.service.js';
/*
import { QueueModule } from '../queue/queue.module.js';
*/
import { PointPoolModule } from '../point-pool/point-pool.module.js';
import { FirstOverlayModule } from '../first-overlay/first-overlay.module.js';
import { ShoutoutHandler } from '../commands/handlers/shoutout.handler.js';
import { TwitchCommandRegistration } from './twitch-command-registration.service.js';
import { ChatOverlayModule } from '../chat-overlay/chat-overlay.module.js';

@Module({
  controllers: [TwitchController],
  providers: [
    TwitchService,
    TwitchOAuthClient,
    TwitchConnectorService,
    TwitchTokenStore,
    TwitchEventSubService,
    TwitchEventNormalizer,
    TwitchEventIngestionService,
    TwitchOAuthStateService,
    ShoutoutHandler,
    TwitchCommandRegistration,
  ],
  imports: [
    EventsModule,
    StreamsModule,
    CommandsModule,
    SecurityModule,
    PointPoolModule,
    FirstOverlayModule,
    ChatOverlayModule,
  ],
  exports: [TwitchService],
})
export class TwitchModule {}
