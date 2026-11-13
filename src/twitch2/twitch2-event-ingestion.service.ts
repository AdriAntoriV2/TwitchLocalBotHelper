import { Injectable, Logger } from '@nestjs/common';
import { EventsService } from '../events/events.service.js';
import { StreamsService } from '../streams/streams.service.js';

@Injectable()
export class Twitch2EventIngestionService {
  private readonly logger = new Logger(Twitch2EventIngestionService.name);
  private readonly warnedEventTypesWhileOffline = new Set<string>();

  constructor(
    private readonly eventsService: EventsService,
    private readonly streamsService: StreamsService,
  ) {}

  async ingest(
    type: string,
    externalId: string,
    payload: Record<string, unknown>,
  ) {
    const stream = await this.streamsService.findActive();

    if (!stream) {
      if (!this.warnedEventTypesWhileOffline.has(type)) {
        this.logger.warn(`Ignoring Twitch event ${type}: no active stream`);
        this.warnedEventTypesWhileOffline.add(type);
      }

      return null;
    }

    this.warnedEventTypesWhileOffline.clear();

    return this.eventsService.create({
      streamId: stream.id,
      type,
      externalId,
      payload,
    });
  }
}