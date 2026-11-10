import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TwitchEventIngestionService } from './twitch-event-ingestion.service.js';
import type { EventsService } from '../events/events.service.js';
import type { StreamsService } from '../streams/streams.service.js';

describe('TwitchEventIngestionService', () => {
  it('warns once per event type while there is no active stream', async () => {
    const streams = { findActive: vi.fn().mockResolvedValue(null) };
    const events = { create: vi.fn() };
    const service = new TwitchEventIngestionService(
      events as unknown as EventsService,
      streams as unknown as StreamsService,
    );
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    await service.ingest('twitch.channel.follow', 'event-1', {});
    await service.ingest('twitch.channel.follow', 'event-2', {});
    await service.ingest('twitch.channel.subscribe', 'event-3', {});

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      'Ignoring Twitch event twitch.channel.follow: no active stream',
    );
    expect(events.create).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('warns again after an active stream resumes', async () => {
    const streams = {
      findActive: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'stream-1' })
        .mockResolvedValueOnce(null),
    };
    const events = { create: vi.fn().mockResolvedValue({ id: 'event-1' }) };
    const service = new TwitchEventIngestionService(
      events as unknown as EventsService,
      streams as unknown as StreamsService,
    );
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    await service.ingest('twitch.channel.follow', 'event-1', {});
    await service.ingest('twitch.channel.follow', 'event-2', {});
    await service.ingest('twitch.channel.follow', 'event-3', {});

    expect(warn).toHaveBeenCalledTimes(2);
    expect(events.create).toHaveBeenCalledOnce();

    warn.mockRestore();
  });
});
