import { Injectable } from '@nestjs/common';

interface NormalizedTwitchEvent {
  type: string;
  externalId: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class Twitch2EventNormalizer {
  normalize(
    messageId: string,
    subscriptionType: string,
    payload: Record<string, unknown>,
  ): NormalizedTwitchEvent {
    return {
      type: `twitch.${subscriptionType}`,
      externalId: messageId,
      payload,
    };
  }
}