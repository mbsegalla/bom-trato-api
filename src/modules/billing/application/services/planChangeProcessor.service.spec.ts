import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanChange, type PlanChangeProps } from '../../domain/entities/planChange.entity.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { PlanChangeGateway, RemotePlanChangeState } from '../ports/planChangeGateway.port.js';

import { PlanChangeProcessor } from './planChangeProcessor.service.js';

const now = new Date('2026-01-01T12:00:00Z');
const second = now.getTime() / 1000;
const state: PlanChangeProps = {
  id: 'change',
  organizationId: 'org',
  requestedById: 'owner',
  sourcePlanPriceId: 'source',
  targetPlanPriceId: 'target',
  targetMaxUsers: 5,
  stripeCustomerId: 'cus_fixture',
  stripeSubscriptionId: 'sub_fixture',
  stripeItemId: 'si_fixture',
  sourceStripePriceId: 'price_source',
  targetStripePriceId: 'price_target',
  mode: 'IMMEDIATE',
  status: 'PROCESSING',
  currency: 'brl',
  amountDueNow: 1000,
  targetAmountInCents: 5990,
  targetInterval: 'MONTH',
  targetIntervalCount: 1,
  periodStart: second - 3600,
  periodEnd: second + 86400,
  prorationDate: second,
  expiresAt: new Date(now.getTime() + 300000),
  startedAt: now,
  stripeInvoiceId: null,
  stripeScheduleId: null,
};
const remote: RemotePlanChangeState = {
  status: 'PENDING_PAYMENT',
  stripeInvoiceId: 'in_fixture',
  stripeScheduleId: null,
  clientSecret: 'fixture-secret',
};
const snapshot = { subscriptions: [], invoices: [] };

function fixture() {
  const billing = {
    assertOwner: vi.fn().mockResolvedValue(undefined),
    saveSnapshot: vi.fn().mockResolvedValue(undefined),
  };
  const repository = {
    find: vi.fn().mockResolvedValue(state),
    save: vi.fn().mockResolvedValue(undefined),
    postpone: vi.fn().mockResolvedValue(undefined),
  };
  const gateway = { snapshot: vi.fn().mockResolvedValue(snapshot) };
  const planGateway = {
    inspect: vi.fn().mockResolvedValue(null),
    execute: vi.fn().mockResolvedValue(remote),
    releaseSchedule: vi.fn().mockResolvedValue(undefined),
  };
  const processor = new PlanChangeProcessor(
    billing as unknown as BillingRepository,
    repository as unknown as PlanChangeRepository,
    gateway as unknown as BillingGateway,
    planGateway as unknown as PlanChangeGateway,
  );

  return { billing, repository, gateway, planGateway, processor };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => vi.useRealTimers());

describe('PlanChangeProcessor', () => {
  it('verifies the owner and tenant before loading a change', async () => {
    const f = fixture();
    const params = { organizationId: state.organizationId, userId: state.requestedById, changeId: state.id };

    expect((await f.processor.ownedChange(params)).snapshot()).toEqual(state);
    expect(f.billing.assertOwner).toHaveBeenCalledWith(params.organizationId, params.userId);

    f.repository.find.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...state, organizationId: 'other' });

    await expect(f.processor.ownedChange(params)).rejects.toThrow('PLAN_CHANGE_NOT_FOUND');
    await expect(f.processor.ownedChange(params)).rejects.toThrow('PLAN_CHANGE_NOT_FOUND');
  });

  it.each(['QUOTED', 'APPLIED', 'CANCELED', 'EXPIRED'] as const)(
    'returns stored %s state without remote execution',
    async (status) => {
      const f = fixture();

      expect(await f.processor.refresh(PlanChange.restore({ ...state, status }))).toMatchObject({
        status,
        clientSecret: null,
      });
      expect(f.planGateway.inspect).not.toHaveBeenCalled();
      expect(f.planGateway.execute).not.toHaveBeenCalled();
    },
  );

  it('recovers a known remote outcome without repeating the provider write', async () => {
    const f = fixture();
    f.planGateway.inspect.mockResolvedValueOnce(remote);

    expect(await f.processor.refresh(PlanChange.restore(state))).toMatchObject({
      status: 'PENDING_PAYMENT',
      clientSecret: remote.clientSecret,
    });
    expect(f.planGateway.execute).not.toHaveBeenCalled();
    expect(f.gateway.snapshot).toHaveBeenCalledWith(state.stripeCustomerId, remote.stripeInvoiceId);
    expect(f.billing.saveSnapshot).toHaveBeenCalledWith({ organizationId: state.organizationId, snapshot });
    expect(f.repository.save).toHaveBeenCalledWith(expect.any(PlanChange));
    expect(f.repository.postpone).toHaveBeenCalledWith(state.id, 60);
  });

  it('retries an uncertain processing operation only inside its idempotency and billing-period windows', async () => {
    const f = fixture();

    expect(await f.processor.refresh(PlanChange.restore(state))).toMatchObject({ status: 'PENDING_PAYMENT' });
    expect(f.planGateway.execute).toHaveBeenCalledExactlyOnceWith(state);

    for (const override of [
      { startedAt: null },
      { startedAt: new Date(now.getTime() - 23 * 3600000) },
      { periodEnd: second },
      { status: 'PENDING_PAYMENT' as const },
    ]) {
      await expect(f.processor.refresh(PlanChange.restore({ ...state, ...override }))).rejects.toThrow(
        'BILLING_RECONCILIATION_REQUIRED',
      );
    }

    expect(f.planGateway.execute).toHaveBeenCalledTimes(1);
  });

  it('releases the schedule only after a scheduled change becomes applied', async () => {
    const f = fixture();
    const change = PlanChange.restore({ ...state, mode: 'PERIOD_END', status: 'SCHEDULED' });

    expect(
      await f.processor.saveRemote(change, {
        status: 'APPLIED',
        stripeInvoiceId: null,
        stripeScheduleId: 'sched_fixture',
        clientSecret: null,
      }),
    ).toMatchObject({ status: 'APPLIED', effectiveAt: new Date(state.periodEnd * 1000) });

    expect(f.planGateway.releaseSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'APPLIED',
        stripeScheduleId: 'sched_fixture',
      }),
    );
    expect(f.planGateway.releaseSchedule.mock.invocationCallOrder[0]).toBeLessThan(
      f.gateway.snapshot.mock.invocationCallOrder[0]!,
    );
  });

  it.each(['CANCELED', 'EXPIRED', 'APPLIED'] as const)('persists terminal provider outcome %s', async (status) => {
    const f = fixture();
    const change = PlanChange.restore(state);

    expect(await f.processor.saveRemote(change, { ...remote, status, clientSecret: null })).toMatchObject({
      status,
      clientSecret: null,
    });
    expect(change.snapshot()).toMatchObject({ status, stripeInvoiceId: remote.stripeInvoiceId });
    expect(f.planGateway.releaseSchedule).not.toHaveBeenCalled();
    expect(f.billing.saveSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      f.repository.save.mock.invocationCallOrder[0]!,
    );
  });

  it('does not persist the change or schedule another check when snapshot synchronization fails', async () => {
    const f = fixture();
    f.gateway.snapshot.mockRejectedValueOnce(new Error('Fixture read failure'));

    await expect(f.processor.execute(PlanChange.restore(state))).rejects.toThrow('Fixture read failure');
    expect(f.repository.save).not.toHaveBeenCalled();
    expect(f.repository.postpone).not.toHaveBeenCalled();
  });
});
