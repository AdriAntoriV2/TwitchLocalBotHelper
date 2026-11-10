import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TwitchEventSubService } from './twitch-eventsub.service.js';
import type { TwitchConnectorService } from './twitch-connector.service.js';
import type { StreamsService } from '../streams/streams.service.js';

describe('TwitchEventSubService', () => {
  it('logs the offline status once until Twitch reports a live stream', async () => {
    let onSession:
      | ((sessionId: string, isReconnectHandover: boolean) => Promise<void>)
      | undefined;
    const apiGet = vi
      .fn()
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [{ title: 'Live', started_at: '2026-11-10T00:00:00Z' }],
      })
      .mockResolvedValueOnce({ data: [] });
    const connector = {
      client: {
        eventSub: {
          onSession: (listener: typeof onSession) => {
            onSession = listener ?? undefined;
            return () => {};
          },
          onNotification: () => () => {},
        },
        api: { get: apiGet },
        subscriptions: {
          subscribe: vi.fn().mockResolvedValue({ data: [{ status: 'enabled' }] }),
        },
      },
      isReady: true,
      getBroadcasterUserId: () => 'broadcaster-1',
      getAuthenticatedUserId: () => 'broadcaster-1',
      handleError: vi.fn().mockResolvedValue(false),
    };
    const streams = {
      findActive: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'stream-1' }),
    };
    const service = new TwitchEventSubService(
      connector as unknown as TwitchConnectorService,
      streams as unknown as StreamsService,
      {} as ConstructorParameters<typeof TwitchEventSubService>[2],
      {} as ConstructorParameters<typeof TwitchEventSubService>[3],
      {} as ConstructorParameters<typeof TwitchEventSubService>[4],
      {} as ConstructorParameters<typeof TwitchEventSubService>[5],
      {} as ConstructorParameters<typeof TwitchEventSubService>[6],
      {} as ConstructorParameters<typeof TwitchEventSubService>[7],
      {} as ConstructorParameters<typeof TwitchEventSubService>[8],
    );
    const debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});

    await onSession?.('session-1', false);
    await onSession?.('session-2', false);
    await onSession?.('session-3', false);
    await onSession?.('session-4', false);

    expect(debug).toHaveBeenCalledTimes(2);
    expect(debug).toHaveBeenCalledWith('Twitch channel is currently offline.');

    debug.mockRestore();
    await service.onModuleDestroy();
  });
});
