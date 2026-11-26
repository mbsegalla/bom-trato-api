import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';

import { PrismaInAppNotificationRepository } from '../../../src/modules/notifications/infrastructure/repositories/prismaInAppNotification.repository.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';

databaseSuite('in-app notification persistence (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  async function tenant() {
    const actor = await db.tenant();

    db.cleanup(() => db.prisma.inAppNotification.deleteMany({ where: { organizationId: actor.organizationId } }));

    return actor;
  }

  function input(actor: { organizationId: string; userId: string }, key = randomUUID()) {
    return {
      ...actor,
      key,
      type: 'PAYMENT_FAILED' as const,
      title: 'Fixture payment failed',
      message: 'Fixture message',
      href: '/settings?tab=billing',
    };
  }

  it('deduplicates notification keys and preserves unread count across limited pages', async () => {
    const actor = await tenant();
    const repository = new PrismaInAppNotificationRepository(db.prisma);
    const first = input(actor);

    await Promise.all([repository.enqueue(first), repository.enqueue(first)]);
    await repository.enqueue(input(actor));

    const page = await repository.list({ ...actor, limit: 1 });

    expect(page.items).toHaveLength(1);
    expect(page.unreadCount).toBe(2);
    expect(await db.prisma.inAppNotification.count({ where: { organizationId: actor.organizationId, key: first.key } })).toBe(1);
  });

  it('isolates reads and acknowledgements by both user and organization', async () => {
    const first = await tenant();
    const other = await tenant();
    const repository = new PrismaInAppNotificationRepository(db.prisma);

    await repository.enqueue(input(first));
    await repository.enqueue(input(other));

    const initial = await repository.list({ ...first, limit: 10 });
    const id = initial.items[0]!.id;
    const now = new Date();

    expect(await repository.markRead({ ...other, id, now })).toBe(false);
    expect(await repository.markRead({ ...first, userId: other.userId, id, now })).toBe(false);
    expect(await repository.markRead({ ...first, organizationId: other.organizationId, id, now })).toBe(false);
    expect((await repository.list({ ...first, limit: 10 })).unreadCount).toBe(1);

    expect(await repository.markRead({ ...first, id, now })).toBe(true);
    expect((await repository.list({ ...first, limit: 10 })).unreadCount).toBe(0);
    expect((await repository.list({ ...other, limit: 10 })).unreadCount).toBe(1);
  });

  it('marks only the requested recipient notifications as read and verifies membership', async () => {
    const first = await tenant();
    const other = await tenant();
    const repository = new PrismaInAppNotificationRepository(db.prisma);

    await repository.enqueue(input(first));
    await repository.enqueue(input(first));
    await repository.enqueue(input(other));

    await repository.markAllRead({ ...first, now: new Date() });

    const page = await repository.list({ ...first, limit: 10 });

    expect(page.unreadCount).toBe(0);
    expect(page.items).toHaveLength(2);
    expect(page.items.every((item) => item.readAt instanceof Date)).toBe(true);
    expect((await repository.list({ ...other, limit: 10 })).unreadCount).toBe(1);
    expect(await repository.isMember(first.userId, first.organizationId)).toBe(true);
    expect(await repository.isMember(other.userId, first.organizationId)).toBe(false);
  });
});
