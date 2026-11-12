import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';
import configuration from './configuration.js';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),

        PORT: Joi.number().port().default(6769),

        DATABASE_URL: Joi.string().uri().required(),

        TWITCH_CLIENT_ID: Joi.string().required(),
        TWITCH_TOKEN_ENCRYPTION_KEY: Joi.string()
          .pattern(/^[0-9a-fA-F]{64}$/)
          .required(),
        TWITCH_ADMIN_USER_ID: Joi.string().pattern(/^\d+$/).required(),

        SESSION_SECRET: Joi.string().min(32).required(),

        SONG_REQUEST_QUEUE_LIMIT: Joi.number().integer().min(1).default(10),

        MPV_PATH: Joi.string().default('mpv'),

        MPV_IPC_PATH: Joi.string().default(
          process.platform === 'win32'
            ? '\\\\.\\pipe\\streamops-mpv'
            : '/tmp/streamops-mpv.sock',
        ),
        RADIO_URL: Joi.string().uri().optional(),

        CHAT_OVERLAY_MAX_MESSAGES: Joi.number().integer().min(1).default(30),

        CHAT_OVERLAY_MESSAGE_TTL_SECONDS: Joi.number()
          .integer()
          .min(1)
          .default(3600),
      }),
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}
