import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  ChatCommandContext,
  ChatCommandHandler,
} from '../types/chat-command.types.js';
import { Twitch2ConnectionService } from '../../twitch2/twitch2-connection.service.js';

@Injectable()
export class ShoutoutHandler implements ChatCommandHandler {
  readonly command = 'so';

  constructor(
    private readonly twitchService: Twitch2ConnectionService,
  ) {}

  async execute(context: ChatCommandContext) {
    const match = context.rawMessage.match(
      /^!so\s+(@?[a-zA-Z0-9_]{1,25})\s*$/i,
    );

    if (!match) {
      return {
        ok: false,
        message: 'Usage: !so <username>',
      };
    }

    try {
      const info = await this.twitchService.getShoutoutInfo(
        match[1],
      );

      if (!info) {
        return {
          ok: false,
          message: `Twitch user "${match[1].replace(/^@/, '')}" was not found.`,
        };
      }

      const category = info.category || '';
      const title = info.title.trim();

      let activity: string;

      if (category && title) {
        activity = info.isLive
          ? `They're playing ${category} — ${title}.`
          : `They were playing ${category} — ${title}.`;
      } else if (category) {
        activity = info.isLive
          ? `They're playing ${category}.`
          : `Their last listed category was ${category}.`;
      } else if (title) {
        activity = info.isLive
          ? `They're streaming — ${title}.`
          : `Their last listed stream title was ${title}.`;
      } else {
        activity = info.isLive
          ? "They're live right now."
          : "They're currently offline.";
      }

      return {
        ok: true,
        message:
          `Shoutout to ${info.displayName}! ` +
          `${activity} Go check them out! ` +
          `https://twitch.tv/${info.login}`,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        return {
          ok: false,
          message: 'Shoutouts are unavailable because Twitch is not connected.',
        };
      }

      throw error;
    }
  }
}