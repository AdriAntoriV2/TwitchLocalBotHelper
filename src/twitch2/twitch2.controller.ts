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
import { Twitch2ConnectionService, type Twitch2DeviceLogin } from './twitch2-connection.service.js';
import {
  ApiTwitchControllerDocs,
  ApiTwitchLogout,
  ApiTwitchOAuth,
  ApiTwitchOAuthStatus,
} from './twitch2.swagger.js';

@ApiTwitchControllerDocs()
@Controller('twitch')
export class Twitch2Controller {
  constructor(
    private readonly twitchService: Twitch2ConnectionService,
    private readonly config: ConfigService,
  ) {}

  @Get('oauth')
  @ApiTwitchOAuth()
  async authorize(): Promise<Twitch2DeviceLogin> {
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