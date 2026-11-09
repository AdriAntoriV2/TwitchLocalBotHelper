import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { TwitchService, type TwitchDeviceLogin } from './twitch.service.js';
import {
  ApiTwitchControllerDocs,
  ApiTwitchLogout,
  ApiTwitchOAuth,
  ApiTwitchOAuthStatus,
} from './twitch.swagger.js';

@ApiTwitchControllerDocs()
@Controller('twitch')
export class TwitchController {
  constructor(
    private readonly twitchService: TwitchService,
    private readonly config: ConfigService,
  ) {}

  @Get('oauth')
  @ApiTwitchOAuth()
  async authorize(): Promise<TwitchDeviceLogin> {
    return this.twitchService.startDeviceLogin();
  }

  @Get('oauth/status')
  @ApiTwitchOAuthStatus()
  getAuthorizationStatus() {
    return this.twitchService.getDeviceLoginStatus();
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiTwitchLogout()
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await new Promise<void>((resolve, reject) => {
      request.session.destroy((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    response.clearCookie('streamops.sid', {
      httpOnly: true,
      secure: this.config.getOrThrow<boolean>('session.cookieSecure'),
      sameSite: 'lax',
      path: '/',
    });
  }
}
