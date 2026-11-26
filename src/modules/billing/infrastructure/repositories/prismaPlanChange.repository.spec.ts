import { describe, expect, it, vi } from 'vitest';

import { asymmetric } from '../../../../../test/support/asymmetricMatchers.js';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PlanChange, type PlanChangeProps } from '../../domain/entities/planChange.entity.js';
import { BillingWork } from '../events/billing.events.js';
import type { BillingWorkerNotifier } from '../events/billingWorkerNotifier.service.js';

import { PrismaPlanChangeRepository } from './prismaPlanChange.repository.js';

function fixture() {
  const now = Math.floor(Date.now() / 1000);
  const state: PlanChangeProps = {
    id: 'change',
    organizationId: 'org',
    requestedById: 'owner',
    sourcePlanPriceId: 'source',
    targetPlanPriceId: 'target',
    targetMaxUsers: 3,
    stripeCustomerId: 'cus_fixture',
    stripeSubscriptionId: 'sub_fixture',
    stripeItemId: 'si_fixture',
    sourceStripePriceId: 'price_source',
    targetStripePriceId: 'price_target',
    mode: 'IMMEDIATE',
    status: 'QUOTED',
    currency: 'brl',
    amountDueNow: 3000,
    targetAmountInCents: 6000,
    targetInterval: 'MONTH',
    targetIntervalCount: 1,
    periodStart: now - 3600,
    periodEnd: now + 86400,
    prorationDate: now,
    expiresAt: new Date((now + 600) * 1000),
    startedAt: null,
    stripeInvoiceId: null,
    stripeScheduleId: null,
  };
  const findUnique = vi.fn().mockResolvedValue(null);
  const findUniqueOrThrow = vi.fn().mockResolvedValue(state);
  const findMany = vi.fn().mockResolvedValue([]);
  const create = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn().mockResolvedValue(state);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const count = vi.fn().mockResolvedValue(3);
  const lock = vi.fn<(parts: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>>().mockResolvedValue([]);
  const price = vi.fn().mockResolvedValue(null);
  const tx = { planChange: { findUniqueOrThrow, update }, organizationMember: { count }, $queryRaw: lock };
  const transaction = vi.fn(async (operation: (value: typeof tx) => Promise<unknown>) => operation(tx));
  const notify = vi.fn();
  const scheduleChanged = vi.fn();
  const repository = new PrismaPlanChangeRepository(
    {
      planPrice: { findUnique: price },
      planChange: { findUnique, findMany, create, update, updateMany },
      $transaction: transaction,
    } as unknown as PrismaService,
    { notify, scheduleChanged } as unknown as BillingWorkerNotifier,
  );

  return {
    repository,
    state,
    findUnique,
    findUniqueOrThrow,
    findMany,
    create,
    update,
    updateMany,
    count,
    lock,
    price,
    transaction,
    notify,
    scheduleChanged,
  };
}

describe('PrismaPlanChangeRepository', () => {
  it('maps catalog pricing and member capacity and rejects missing prices', async () => {
    const f = fixture();
    f.price.mockResolvedValueOnce({
      id: 'target',
      planId: 'plan',
      amountInCents: 6000,
      currency: 'brl',
      interval: 'MONTH',
      intervalCount: 1,
      plan: { changeLevel: 2, maxUsers: 3 },
    });

    expect(await f.repository.priceInfo('target')).toEqual({
      id: 'target',
      planId: 'plan',
      level: 2,
      maxUsers: 3,
      amountInCents: 6000,
      currency: 'brl',
      interval: 'MONTH',
      intervalCount: 1,
    });
    await expect(f.repository.priceInfo('missing')).rejects.toThrow('PLAN_UNAVAILABLE');
  });

  it('locks the organization before checking capacity and reserving a change', async () => {
    const f = fixture();

    await f.repository.reserve(f.state.id);

    expect(f.lock.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    expect(f.lock.mock.calls[0][1]).toBe('org');
    expect(f.count).toHaveBeenCalledWith({ where: { organizationId: 'org' } });
    expect(f.update).toHaveBeenCalledWith({
      where: { id: 'change' },
      data: { activeOrganizationId: 'org', status: 'PROCESSING', startedAt: asymmetric.any(Date) },
    });
    expect(f.lock.mock.invocationCallOrder[0]).toBeLessThan(f.count.mock.invocationCallOrder[0]);
    expect(f.update.mock.invocationCallOrder[0]).toBeLessThan(f.notify.mock.invocationCallOrder[0]);
    expect(f.notify).toHaveBeenCalledWith(BillingWork.PLAN_CHANGES);
  });

  it('rejects a downgrade that no longer fits current membership or an expired quote', async () => {
    const f = fixture();
    f.count.mockResolvedValueOnce(4);

    await expect(f.repository.reserve('change')).rejects.toThrow('PLAN_MEMBER_LIMIT');

    f.findUniqueOrThrow.mockResolvedValueOnce({ ...f.state, expiresAt: new Date(0) });
    await expect(f.repository.reserve('change')).rejects.toThrow('PLAN_CHANGE_QUOTE_EXPIRED');
    expect(f.update).not.toHaveBeenCalled();
    expect(f.notify).not.toHaveBeenCalled();
  });

  it('keeps processing changes exclusive and releases the active slot after application', async () => {
    const f = fixture();
    const change = PlanChange.restore(f.state);
    change.confirm(new Date());

    await f.repository.save(change);
    expect(f.update).toHaveBeenLastCalledWith(
      asymmetric.objectContaining({
        data: asymmetric.objectContaining({ status: 'PROCESSING', activeOrganizationId: 'org' }),
      }),
    );
    expect(f.notify).not.toHaveBeenCalled();

    change.markApplied();
    await f.repository.save(change);

    expect(f.update).toHaveBeenLastCalledWith(
      asymmetric.objectContaining({
        data: asymmetric.objectContaining({ status: 'APPLIED', activeOrganizationId: null }),
      }),
    );
    expect(f.notify).toHaveBeenCalledWith(BillingWork.CONFIRMATIONS);
    expect(f.scheduleChanged).toHaveBeenCalledTimes(2);
  });

  it('loads quotes by ID and active changes by organization, then schedules only active work', async () => {
    const f = fixture();

    await f.repository.create(PlanChange.restore(f.state));
    await f.repository.find('change');
    await f.repository.active('org');
    await f.repository.due();
    f.updateMany.mockResolvedValueOnce({ count: 0 });
    await f.repository.postpone('change', 15);
    expect(f.scheduleChanged).not.toHaveBeenCalled();
    await f.repository.postpone('change', 15);

    expect(f.create).toHaveBeenCalledWith({ data: f.state });
    expect(f.findUnique).toHaveBeenNthCalledWith(1, { where: { id: 'change' } });
    expect(f.findUnique).toHaveBeenNthCalledWith(2, { where: { activeOrganizationId: 'org' } });
    expect(f.findMany).toHaveBeenCalledWith({
      where: { activeOrganizationId: { not: null }, nextCheckAt: { lte: asymmetric.any(Date) } },
      orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }],
      take: 5,
    });
    expect(f.scheduleChanged).toHaveBeenCalledWith(BillingWork.PLAN_CHANGES);
  });
});
