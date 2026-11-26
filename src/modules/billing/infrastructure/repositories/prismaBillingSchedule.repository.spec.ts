import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { BillingWork } from '../events/billing.events.js';
import { PrismaBillingScheduleRepository } from './prismaBillingSchedule.repository.js';

const now = new Date('2026-01-01T00:00:00Z');

function fixture() {
  const query = vi.fn();
  const plan = vi.fn();
  const payment = vi.fn();
  const customer = vi.fn();
  const repository = new PrismaBillingScheduleRepository({
    $queryRaw: query,
    planChange: { findFirst: plan },
    paymentMethodUpdate: { findFirst: payment },
    billingCustomer: { findFirst: customer },
  } as unknown as PrismaService);

  return { repository, query, plan, payment, customer };
}

describe('PrismaBillingScheduleRepository', () => {
  it('accounts for active webhook leases and excludes terminal work', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([{ at: now }]).mockResolvedValueOnce([{ at: null }]).mockResolvedValueOnce([]);

    expect(await f.repository.nextRunAt(BillingWork.WEBHOOKS)).toEqual(now);
    expect(await f.repository.nextRunAt(BillingWork.WEBHOOKS)).toBeNull();
    expect(await f.repository.nextRunAt(BillingWork.WEBHOOKS)).toBeNull();

    const sql = (f.query.mock.calls[0]![0] as TemplateStringsArray).join('?');

    expect(sql).toContain('GREATEST("nextAttemptAt", "leaseExpiresAt")');
    expect(sql).toContain('"processedAt" IS NULL');
    expect(sql).toContain('"failedAt" IS NULL');
  });

  it('selects only active plan changes in stable due-date order', async () => {
    const f = fixture();
    f.plan.mockResolvedValueOnce({ nextCheckAt: now }).mockResolvedValueOnce(null);

    expect(await f.repository.nextRunAt(BillingWork.PLAN_CHANGES)).toEqual(now);
    expect(await f.repository.nextRunAt(BillingWork.PLAN_CHANGES)).toBeNull();
    expect(f.plan).toHaveBeenCalledWith({
      where: { activeOrganizationId: { not: null } },
      orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }],
      select: { nextCheckAt: true },
    });
  });

  it('selects pending payment updates and customers with a remote billing identity', async () => {
    const f = fixture();
    f.payment.mockResolvedValueOnce({ nextCheckAt: now }).mockResolvedValueOnce(null);
    f.customer.mockResolvedValueOnce({ nextReconcileAt: now }).mockResolvedValueOnce(null);

    expect(await f.repository.nextRunAt(BillingWork.PAYMENT_METHOD_UPDATES)).toEqual(now);
    expect(await f.repository.nextRunAt(BillingWork.RECONCILIATION)).toEqual(now);
    expect(await f.repository.nextRunAt(BillingWork.PAYMENT_METHOD_UPDATES)).toBeNull();
    expect(await f.repository.nextRunAt(BillingWork.RECONCILIATION)).toBeNull();
    expect(f.payment).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'PENDING' } }));
    expect(f.customer).toHaveBeenCalledWith(expect.objectContaining({ where: { stripeCustomerId: { not: null } } }));
  });

  it('does not query the database for confirmations', async () => {
    const f = fixture();

    expect(await f.repository.nextRunAt(BillingWork.CONFIRMATIONS)).toBeNull();
    for (const query of [f.query, f.plan, f.payment, f.customer]) {
      expect(query).not.toHaveBeenCalled();
    }
  });
});
