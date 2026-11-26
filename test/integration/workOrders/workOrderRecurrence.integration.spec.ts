import { expect, it } from 'vitest';

import { workOrderRecurrenceDate } from '../../../src/modules/workOrders/domain/policies/workOrderRecurrence.policy.js';
import { PrismaWorkOrderRecurrenceRepository } from '../../../src/modules/workOrders/infrastructure/transactions/prismaWorkOrderRecurrenceRepository.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';
import { createWorkOrderFixture } from './support/workOrder.fixture.js';

databaseSuite('work order recurrence configuration (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  async function fixture() {
    const f = await createWorkOrderFixture(db);
    const params = { ...f.actor, workOrderId: f.order.id };
    const repository = new PrismaWorkOrderRecurrenceRepository(db.prisma);
    const today = workOrderRecurrenceDate(new Date());
    const tomorrow = workOrderRecurrenceDate(new Date(Date.now() + 86400000));
    const input = {
      intervalUnit: 'MONTH' as const,
      intervalCount: 1,
      nextVisitOn: tomorrow,
      enabled: true,
      autoGenerateEnabled: true,
      version: 0,
    };

    db.cleanup(() => db.prisma.workOrderRecurrence.deleteMany({ where: { workOrderId: f.order.id } }));

    return { ...f, params, repository, input, today };
  }

  it('creates and updates versioned recurrence settings without changing the completed order', async () => {
    const f = await fixture();

    expect(await f.repository.read(f.params)).toMatchObject({ recurrence: null, canConfigure: true });
    expect(await f.repository.save(f.params, f.input)).toMatchObject({
      recurrence: { ...f.input, version: 1, lastGeneratedQuoteId: null, lastGeneratedVisitOn: null },
    });

    const { autoGenerateEnabled: _auto, ...input } = f.input;

    expect(await f.repository.save(f.params, { ...input, version: 1, enabled: false })).toMatchObject({
      recurrence: { enabled: false, autoGenerateEnabled: true, version: 2 },
    });
    expect(await db.prisma.workOrder.findUniqueOrThrow({ where: { id: f.order.id } })).toMatchObject({
      status: 'COMPLETED',
      version: f.order.version,
      completedAt: f.order.completedAt,
    });
    await expect(f.repository.save(f.params, { ...f.input, version: 1 }))
      .rejects.toThrow('WORK_ORDER_RECURRENCE_VERSION_CONFLICT');
  });

  it('allows only one concurrent update for the same recurrence version', async () => {
    const f = await fixture();
    await f.repository.save(f.params, f.input);

    const results = await Promise.allSettled([
      f.repository.save(f.params, { ...f.input, version: 1, intervalCount: 2 }),
      f.repository.save(f.params, { ...f.input, version: 1, intervalCount: 3 }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')?.reason)
      .toMatchObject({ code: 'WORK_ORDER_RECURRENCE_VERSION_CONFLICT' });
    expect((await f.repository.read(f.params)).recurrence?.version).toBe(2);
  }, 30000);

  it('permits pausing an archived customer but rejects reactivation and new archived plans', async () => {
    const f = await fixture();
    await f.repository.save(f.params, f.input);
    await db.prisma.customer.update({
      where: { id: f.customer.id },
      data: { archivedAt: new Date() },
    });

    await expect(f.repository.save(f.params, { ...f.input, version: 1 }))
      .rejects.toThrow('WORK_ORDER_RECURRENCE_CUSTOMER_ARCHIVED');
    expect(await f.repository.save(f.params, { ...f.input, version: 1, enabled: false }))
      .toMatchObject({ customerArchived: true, recurrence: { enabled: false, version: 2 } });
    await expect(f.repository.save(f.params, { ...f.input, version: 2 }))
      .rejects.toThrow('WORK_ORDER_RECURRENCE_CUSTOMER_ARCHIVED');

    await db.prisma.workOrderRecurrence.delete({ where: { workOrderId: f.order.id } });
    expect(await f.repository.read(f.params)).toMatchObject({ recurrence: null, canConfigure: false });
    await expect(f.repository.save(f.params, { ...f.input, enabled: false }))
      .rejects.toThrow('WORK_ORDER_RECURRENCE_CUSTOMER_ARCHIVED');
  });

  it('filters recurrence lists by tenant, customer name and status', async () => {
    const f = await fixture();
    const other = await fixture();
    await f.repository.save(f.params, f.input);
    await other.repository.save(other.params, other.input);

    const list = { page: 1, limit: 10 };
    expect(await f.repository.list(f.actor, { ...list, status: 'ACTIVE', customerName: '  fixture customer  ' }))
      .toMatchObject({ items: [{ workOrderId: f.order.id }], hasMore: false });
    expect((await f.repository.list(f.actor, { ...list, customerName: '%' })).items).toEqual([]);
    expect((await f.repository.list(f.actor, { ...list, status: 'PAUSED' })).items).toEqual([]);

    await f.repository.save(f.params, { ...f.input, version: 1, enabled: false });
    expect((await f.repository.list(f.actor, { ...list, status: 'ACTIVE' })).items).toEqual([]);
    expect(await f.repository.list(f.actor, { ...list, status: 'PAUSED' }))
      .toMatchObject({ items: [{ workOrderId: f.order.id, recurrence: { enabled: false } }] });

    await expect(f.repository.read({ ...f.params, workOrderId: other.order.id }))
      .rejects.toThrow('WORK_ORDER_NOT_FOUND');
    await expect(f.repository.list({ ...f.actor, userId: other.actor.userId }, list))
      .rejects.toThrow('MEMBER_REQUIRED');
  });

  it('keeps historical configuration readable but denies writes without platform access', async () => {
    const f = await fixture();
    await f.repository.save(f.params, f.input);
    await db.prisma.organizationTrial.update({
      where: { organizationId: f.actor.organizationId },
      data: { revokedAt: new Date() },
    });

    expect(await f.repository.read(f.params)).toMatchObject({ canConfigure: false, recurrence: { version: 1 } });
    await expect(f.repository.save(f.params, { ...f.input, version: 1 }))
      .rejects.toThrow('SUBSCRIPTION_REQUIRED');
  });
});
