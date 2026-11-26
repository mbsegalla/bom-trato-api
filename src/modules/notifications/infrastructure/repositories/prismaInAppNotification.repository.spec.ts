import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { IN_APP_NOTIFICATION_CHANNEL } from '../realtime/notificationRealtime.constants.js';
import { PrismaInAppNotificationRepository } from './prismaInAppNotification.repository.js';

const scope = { userId: 'user', organizationId: 'org' };
const now = new Date('2026-01-01T00:00:00Z');
const input = {
  ...scope,
  key: 'fixture',
  type: 'QUOTE_FOLLOW_UP' as const,
  title: 'Fixture notification',
  message: 'Fixture message',
  href: '/quotes/quote',
};

function fixture() {
  const createMany = vi.fn().mockResolvedValue({ count: 1 });
  const findMany = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(0);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findUnique = vi.fn().mockResolvedValue(null);
  const execute = vi.fn().mockResolvedValue(1);
  const repository = new PrismaInAppNotificationRepository({
    inAppNotification: { createMany, findMany, count, updateMany },
    organizationMember: { findUnique },
    $executeRaw: execute,
  } as unknown as Prisma.TransactionClient);

  return { repository, createMany, findMany, count, updateMany, findUnique, execute };
}

describe('PrismaInAppNotificationRepository', () => {
  it('persists normalized notifications and emits only tenant and user identity', async () => {
    const f = fixture();

    await f.repository.enqueue({ ...input, title: '  Fixture notification  ' });

    expect(f.createMany).toHaveBeenCalledWith({
      data: [{ ...input, id: expect.any(String), readAt: null, createdAt: expect.any(Date) }],
      skipDuplicates: true,
    });
    const [parts, channel, payload] = f.execute.mock.calls[0]!;

    expect(parts.join('?')).toContain('pg_notify');
    expect(channel).toBe(IN_APP_NOTIFICATION_CHANNEL);
    expect(JSON.parse(payload)).toEqual(scope);
    expect(f.createMany.mock.invocationCallOrder[0]).toBeLessThan(f.execute.mock.invocationCallOrder[0]!);
  });

  it('does not emit a duplicate event or persist an invalid notification', async () => {
    const f = fixture();
    f.createMany.mockResolvedValueOnce({ count: 0 });

    await f.repository.enqueue(input);
    await expect(f.repository.enqueue({ ...input, href: '//example.invalid' })).rejects.toThrow('INVALID_NOTIFICATION');

    expect(f.createMany).toHaveBeenCalledTimes(1);
    expect(f.execute).not.toHaveBeenCalled();
  });

  it('counts all unread records independently of the visible list limit', async () => {
    const f = fixture();
    const row = { ...input, id: 'notification', readAt: null, createdAt: now };
    f.findMany.mockResolvedValueOnce([row]);
    f.count.mockResolvedValueOnce(8);

    expect(await f.repository.list({ ...scope, limit: 1 })).toEqual({ items: [row], unreadCount: 8 });
    expect(f.findMany).toHaveBeenCalledWith({
      where: scope,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 1,
    });
    expect(f.count).toHaveBeenCalledWith({ where: { ...scope, readAt: null } });
  });

  it('scopes single and bulk read acknowledgments to the same recipient and tenant', async () => {
    const f = fixture();

    expect(await f.repository.markRead({ ...scope, id: 'notification', now })).toBe(true);
    f.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await f.repository.markRead({ ...scope, id: 'foreign', now })).toBe(false);
    await f.repository.markAllRead({ ...scope, now });

    expect(f.updateMany).toHaveBeenNthCalledWith(1, {
      where: { ...scope, id: 'notification' },
      data: { readAt: now },
    });
    expect(f.updateMany).toHaveBeenNthCalledWith(3, {
      where: { ...scope, readAt: null },
      data: { readAt: now },
    });
  });

  it('validates membership through the composite identity', async () => {
    const f = fixture();
    f.findUnique.mockResolvedValueOnce({ id: 'member' });

    expect(await f.repository.isMember(scope.userId, scope.organizationId)).toBe(true);
    expect(await f.repository.isMember(scope.userId, 'other')).toBe(false);
    expect(f.findUnique).toHaveBeenCalledWith({
      where: { organizationId_userId: scope },
      select: { id: true },
    });
  });
});
