import { expect, it } from 'vitest';

import { PrismaDashboardRepository } from '../../../src/modules/dashboard/infrastructure/repositories/prismaDashboard.repository.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';
import { createWorkOrderFixture } from '../workOrders/support/workOrder.fixture.js';

databaseSuite('dashboard operational aggregates (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  async function fixture() {
    const f = await createWorkOrderFixture(db);
    const now = new Date();
    const snapshot = {
      organizationId: f.actor.organizationId,
      customerId: f.customer.id,
      customerName: f.customer.name,
      title: 'Fixture operation',
      currency: 'brl',
      subtotalInCents: 1000,
      discountInCents: 0,
      totalInCents: 1000,
      createdById: f.actor.userId,
      updatedById: f.actor.userId,
    };

    async function quote(status: 'DRAFT' | 'SENT' | 'APPROVED', validUntil: Date | null = null) {
      const row = await db.prisma.quote.create({ data: { ...snapshot, status, validUntil } });

      db.cleanup(() => db.prisma.quote.deleteMany({ where: { id: row.id } }));

      return row;
    }

    async function scheduled(offset: number) {
      const source = await quote('APPROVED');
      const row = await db.prisma.workOrder.create({
        data: {
          ...snapshot, quoteId: source.id, status: 'SCHEDULED',
          scheduledStartAt: new Date(now.getTime() + offset),
          scheduledEndAt: new Date(now.getTime() + offset + 3600000),
          assignedToId: f.actor.userId,
        },
      });
      db.cleanup(() => db.prisma.workOrder.deleteMany({ where: { id: row.id } }));

      return row;
    }

    return { ...f, now, quote, scheduled, repository: new PrismaDashboardRepository(db.prisma, f.actor.organizationId) };
  }

  it('separates pending from expired sent quotes and applies the half-open completion period', async () => {
    const f = await fixture();
    await fixture();

    await f.quote('DRAFT');
    await f.quote('SENT', null);
    await f.quote('SENT', new Date(f.now.getTime() + 60000));
    await f.quote('SENT', f.now);

    const period = { from: new Date(f.now.getTime() - 120000), to: new Date(f.now.getTime() + 60000) };

    expect(await f.repository.summary(period, f.now)).toEqual({
      quotes: { draft: 1, awaitingApproval: 2, expiredSent: 1 },
      workOrders: { open: 0, scheduled: 0, inProgress: 0, completedInPeriod: 1 },
    });
    expect((await f.repository.summary({ ...period, to: f.order.completedAt! }, f.now)).workOrders.completedInPeriod).toBe(0);
  });

  it('filters past appointments, sorts upcoming services and reports pagination only within the tenant', async () => {
    const f = await fixture();
    const other = await fixture();

    await f.scheduled(-3600000);
    const later = await f.scheduled(7200000);
    const earlier = await f.scheduled(3600000);
    await other.scheduled(1000);

    const first = await f.repository.upcomingWorkOrders(f.now, 1);

    expect(first).toMatchObject({ hasMore: true, items: [{ id: earlier.id, assignedTo: { id: f.actor.userId } }] });
    expect((await f.repository.upcomingWorkOrders(f.now, 10)).items.map((item) => item.id)).toEqual([earlier.id, later.id]);
    expect((await f.repository.upcomingWorkOrders(f.now, 10)).hasMore).toBe(false);
  });

  it('returns explicit zero months for an organization without receipt history', async () => {
    const f = await fixture();
    const period = {
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2026-04-01T00:00:00Z'),
    };

    const result = await f.repository.financialTrend(period);

    expect(result.items).toEqual(['01', '02', '03'].map((month) => ({
      periodStart: new Date('2026-' + month + '-01T00:00:00Z'),
      count: 0,
      amountInCents: 0,
    })));
  });
});
