import type { MessageEvent } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IN_APP_NOTIFICATION_CHANNEL } from './notificationRealtime.constants.js';
import { NotificationRealtimeService } from './notificationRealtime.service.js';

const mocks = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue(undefined),
  end: vi.fn().mockResolvedValue(undefined),
  instances: [] as Array<{ emit(event: string, ...args: unknown[]): boolean }>,
}));

vi.mock('pg', async () => {
  const { EventEmitter } = await import('node:events');

  return {
    Client: class extends EventEmitter {
      connect = mocks.connect;
      query = mocks.query;
      end = mocks.end;

      constructor() {
        super();
        mocks.instances.push(this);
      }
    },
  };
});

const config = { url: 'postgresql://fixture:fixture@localhost/fixture' };

describe('NotificationRealtimeService', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.instances.length = 0;
  });

  it('subscribes once and emits only matching organization and user signals', async () => {
    const service = new NotificationRealtimeService(config);
    const events = vi.fn<(event: MessageEvent) => void>();

    await service.onModuleInit();
    await service.onModuleInit();

    const subscription = service.stream('user', 'org').subscribe(events);

    try {
      expect(mocks.connect).toHaveBeenCalledTimes(1);
      expect(mocks.query).toHaveBeenCalledWith('LISTEN "' + IN_APP_NOTIFICATION_CHANNEL + '"');
      expect(events).toHaveBeenCalledWith({ comment: 'connected' });

      const client = mocks.instances[0];
      const notify = (payload: string, channel = IN_APP_NOTIFICATION_CHANNEL) =>
        client.emit('notification', { channel, payload });

      notify(JSON.stringify({ userId: 'other', organizationId: 'org' }));
      notify(JSON.stringify({ userId: 'user', organizationId: 'other' }));
      notify(JSON.stringify({ userId: 'user', organizationId: 'org' }), 'other-channel');
      notify('invalid json');
      notify(JSON.stringify({ userId: 123, organizationId: 'org' }));
      notify(JSON.stringify({ userId: 'user', organizationId: 'org', private: 'not forwarded' }));

      expect(events.mock.calls.map(([event]) => event)).toEqual([
        { comment: 'connected' },
        { type: 'notifications-changed', data: {} },
      ]);
    } finally {
      subscription.unsubscribe();
      await service.onApplicationShutdown();
    }
  });

  it('emits a heartbeat without including account data and stops it after unsubscribe', async () => {
    vi.useFakeTimers();
    const service = new NotificationRealtimeService(config);
    const events = vi.fn<(event: MessageEvent) => void>();
    const subscription = service.stream('user', 'org').subscribe(events);

    try {
      await vi.advanceTimersByTimeAsync(25000);

      expect(events.mock.calls.map(([event]) => event)).toEqual([{ comment: 'connected' }, { comment: 'keep-alive' }]);

      subscription.unsubscribe();
      await vi.advanceTimersByTimeAsync(25000);

      expect(events).toHaveBeenCalledTimes(2);
    } finally {
      subscription.unsubscribe();
      await service.onApplicationShutdown();
    }
  });

  it('reconnects after a lost listener and stops recovery during shutdown', async () => {
    vi.useFakeTimers();
    const service = new NotificationRealtimeService(config);

    try {
      await service.onModuleInit();

      mocks.instances[0].emit('end');
      await vi.advanceTimersByTimeAsync(4999);

      expect(mocks.connect).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);

      expect(mocks.connect).toHaveBeenCalledTimes(2);

      mocks.instances[1].emit('end');
      await service.onApplicationShutdown();
      await vi.advanceTimersByTimeAsync(5000);

      expect(mocks.connect).toHaveBeenCalledTimes(2);
    } finally {
      await service.onApplicationShutdown();
    }
  });

  it('retries failed initial connections without exposing the database error', async () => {
    vi.useFakeTimers();
    mocks.connect.mockRejectedValueOnce(new Error('fixture connection failure'));
    const service = new NotificationRealtimeService(config);

    try {
      await service.onModuleInit();

      expect(mocks.end).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5000);

      expect(mocks.connect).toHaveBeenCalledTimes(2);
      expect(mocks.query).toHaveBeenCalledTimes(1);
    } finally {
      await service.onApplicationShutdown();
    }
  });
});
