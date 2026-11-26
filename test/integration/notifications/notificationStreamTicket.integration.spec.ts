import { createHash } from 'node:crypto';

import { expect, it } from 'vitest';

import { NotificationStreamTicketService } from '../../../src/modules/notifications/infrastructure/realtime/notificationStreamTicket.service.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';

databaseSuite('notification stream ticket security (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  async function fixture() {
    const actor = await db.tenant();
    const now = new Date();
    const session = await db.prisma.authSession.create({
      data: {
        userId: actor.userId,
        lastRefreshedAt: now,
        idleExpiresAt: new Date(now.getTime() + 600000),
        absoluteExpiresAt: new Date(now.getTime() + 3600000),
      },
    });

    db.cleanup(() => db.prisma.authSession.deleteMany({ where: { id: session.id } }));

    return {
      actor,
      params: { ...actor, sessionId: session.id },
      service: new NotificationStreamTicketService(db.prisma),
    };
  }

  it('stores only a short-lived hash and consumes the ticket exactly once', async () => {
    const f = await fixture();
    const before = Date.now();
    const issued = await f.service.issue(f.params);

    expect(issued.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30000);
    expect(issued.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 30000);

    const stored = await db.prisma.notificationStreamTicket.findUniqueOrThrow({
      where: { tokenHash: createHash('sha256').update(issued.ticket).digest('hex') },
    });

    expect(stored).toMatchObject({
      sessionId: f.params.sessionId,
      organizationId: f.actor.organizationId,
      expiresAt: issued.expiresAt,
    });
    expect(stored.tokenHash).not.toBe(issued.ticket);
    expect(await f.service.consume(f.actor.organizationId, issued.ticket)).toEqual(f.actor);

    await expect(f.service.consume(f.actor.organizationId, issued.ticket)).rejects.toThrow('INVALID_STREAM_TICKET');
  });

  it('replaces a previous ticket for the same session and organization', async () => {
    const f = await fixture();
    const first = await f.service.issue(f.params);
    const second = await f.service.issue(f.params);

    expect(second.ticket).not.toBe(first.ticket);
    expect(
      await db.prisma.notificationStreamTicket.count({
        where: { sessionId: f.params.sessionId, organizationId: f.actor.organizationId },
      }),
    ).toBe(1);

    await expect(f.service.consume(f.actor.organizationId, first.ticket)).rejects.toThrow('INVALID_STREAM_TICKET');
    expect(await f.service.consume(f.actor.organizationId, second.ticket)).toEqual(f.actor);
  });

  it('rejects a foreign organization both at issue and consumption time', async () => {
    const f = await fixture();
    const other = await db.tenant();

    await expect(f.service.issue({ ...f.params, organizationId: other.organizationId })).rejects.toThrow(
      'MEMBER_REQUIRED',
    );
    await expect(f.service.issue({ ...f.params, userId: other.userId })).rejects.toThrow('INVALID_STREAM_TICKET');

    const issued = await f.service.issue(f.params);

    await expect(f.service.consume(other.organizationId, issued.ticket)).rejects.toThrow('INVALID_STREAM_TICKET');
    await expect(f.service.consume(f.actor.organizationId, issued.ticket)).rejects.toThrow('INVALID_STREAM_TICKET');
  });

  it('rechecks expiry at consumption and rejects malformed tickets', async () => {
    const f = await fixture();
    const issued = await f.service.issue(f.params);

    await db.prisma.notificationStreamTicket.updateMany({
      where: { sessionId: f.params.sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(f.service.consume(f.actor.organizationId, 'invalid')).rejects.toThrow('INVALID_STREAM_TICKET');
    await expect(f.service.consume(f.actor.organizationId, issued.ticket)).rejects.toThrow('INVALID_STREAM_TICKET');

    expect(await db.prisma.notificationStreamTicket.count({ where: { sessionId: f.params.sessionId } })).toBe(0);
  });

  it('invalidates issued tickets after session revocation', async () => {
    const f = await fixture();
    const issued = await f.service.issue(f.params);

    await db.prisma.authSession.update({
      where: { id: f.params.sessionId },
      data: { revokedAt: new Date() },
    });

    await expect(f.service.consume(f.actor.organizationId, issued.ticket)).rejects.toThrow('INVALID_STREAM_TICKET');
    await expect(f.service.issue(f.params)).rejects.toThrow('INVALID_STREAM_TICKET');
  });

  it('rechecks membership and verified email before returning a stream identity', async () => {
    const f = await fixture();
    const member = await db.user();

    await db.prisma.organizationMember.create({
      data: { organizationId: f.actor.organizationId, userId: member.id, role: 'MEMBER' },
    });
    db.cleanup(() => db.prisma.organizationMember.deleteMany({ where: { userId: member.id } }));

    const now = new Date();
    const session = await db.prisma.authSession.create({
      data: {
        userId: member.id,
        lastRefreshedAt: now,
        idleExpiresAt: new Date(now.getTime() + 600000),
        absoluteExpiresAt: new Date(now.getTime() + 3600000),
      },
    });
    db.cleanup(() => db.prisma.authSession.deleteMany({ where: { id: session.id } }));

    const params = { userId: member.id, organizationId: f.actor.organizationId, sessionId: session.id };
    const issued = await f.service.issue(params);

    await db.prisma.organizationMember.deleteMany({
      where: { organizationId: params.organizationId, userId: member.id },
    });

    await expect(f.service.consume(params.organizationId, issued.ticket)).rejects.toThrow('INVALID_STREAM_TICKET');

    const ownerTicket = await f.service.issue(f.params);

    await db.prisma.user.update({ where: { id: f.actor.userId }, data: { emailVerifiedAt: null } });

    await expect(f.service.consume(f.actor.organizationId, ownerTicket.ticket)).rejects.toThrow(
      'INVALID_STREAM_TICKET',
    );
  });
});
