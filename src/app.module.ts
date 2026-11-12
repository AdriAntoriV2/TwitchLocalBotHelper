import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { join } from 'node:path';
import { ServeStaticModule } from '@nestjs/serve-static';

import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
/*
import { QueueModule } from './queue/queue.module.js';
*/
import { EventsModule } from './events/events.module.js';
import { StreamsModule } from './streams/streams.module.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { Twitch2Module } from './twitch2/twitch2.module.js';
import { CommandsModule } from './commands/commands.module.js';
import { ChatCommandsModule } from './chat-commands/chat-commands.module.js';
import { PointPoolModule } from './point-pool/point-pool.module.js';
import { FirstOverlayModule } from './first-overlay/first-overlay.module.js';
import { ChatOverlayModule } from './chat-overlay/chat-overlay.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    HealthModule,
    EventsModule,
    StreamsModule,
    Twitch2Module,
    CommandsModule,
    ChatCommandsModule,
    PointPoolModule,
    FirstOverlayModule,
    ChatOverlayModule,
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/overlay',
      serveStaticOptions: {
        index: 'point-pool.html',
      },
    }),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes('{*path}')
  }
}