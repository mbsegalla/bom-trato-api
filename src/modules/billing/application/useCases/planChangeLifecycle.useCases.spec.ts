import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanChange, type PlanChangeProps } from '../../domain/entities/planChange.entity.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import type { PlanChangeGateway } from '../ports/planChangeGateway.port.js';
import type { PlanChangeProcessor } from '../services/planChangeProcessor.service.js';

import { CancelPlanChangeUseCase } from './cancelPlanChange.useCase.js';
import { ConfirmPlanChangeUseCase } from './confirmPlanChange.useCase.js';
import { GetPlanChangeUseCase } from './getPlanChange.useCase.js';
import { PreviewPlanChangeUseCase } from './previewPlanChange.useCase.js';
import { ReconcilePlanChangeUseCase } from './reconcilePlanChange.useCase.js';
import { SyncPlanChangeUseCase } from './syncPlanChange.useCase.js';

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
  status: 'QUOTED',
  currency: 'brl',
  amountDueNow: 1000,
  targetAmountInCents: 5990,
  targetInterval: 'MONTH',
  targetIntervalCount: 1,
  periodStart: second - 3600,
  periodEnd: second + 86400,
  prorationDate: second,
  expiresAt: new Date(now.getTime() + 300000),
  startedAt: null,
  stripeInvoiceId: null,
  stripeScheduleId: null,
};
const actor = { organizationId: state.organizationId, userId: state.requestedById };
const action = { ...actor, changeId: state.id };
const target = {
  id: state.targetPlanPriceId,
  stripePriceId: state.targetStripePriceId,
  amountInCents: state.targetAmountInCents,
};
const source = {
  stripeItemId: state.stripeItemId,
  stripePriceId: state.sourceStripePriceId,
  periodStart: state.periodStart,
  periodEnd: state.periodEnd,
};
const sourceInfo = { level: 1, maxUsers: 2, amountInCents: 2990, currency: 'brl', interval: 'MONTH', intervalCount: 1 };
const targetInfo = { ...sourceInfo, level: 2, maxUsers: 5, amountInCents: state.targetAmountInCents };
const subscription = {
  id: 'subscription',
  organizationId: actor.organizationId,
  planPriceId: state.sourcePlanPriceId,
  stripeSubscriptionId: state.stripeSubscriptionId,
  status: 'ACTIVE',
  currentPeriodStart: new Date(state.periodStart * 1000),
  currentPeriodEnd: new Date(state.periodEnd * 1000),
  paidThrough: new Date(state.periodEnd * 1000),
  cancelAtPeriodEnd: false,
  endedAt: null,
  canceledAt: null,
  stripeCreatedAt: now,
};

function fixture() {
  const billing = {
    assertOwner: vi.fn().mockResolvedValue(undefined),
    availablePrice: vi.fn().mockResolvedValue(target),
    customer: vi.fn().mockResolvedValue({ stripeCustomerId: state.stripeCustomerId }),
    saveSnapshot: vi.fn().mockResolvedValue(undefined),
    currentSubscription: vi.fn().mockResolvedValue(subscription),
  };
  const repository = {
    active: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    priceInfo: vi.fn(async (id: string) => (id === state.sourcePlanPriceId ? sourceInfo : targetInfo)),
    reserve: vi.fn().mockResolvedValue({ ...state, status: 'PROCESSING', startedAt: now }),
  };
  const gateway = {
    validatePrice: vi.fn().mockResolvedValue(undefined),
    snapshot: vi.fn().mockResolvedValue({ subscriptions: [], invoices: [] }),
  };
  const planGateway = {
    source: vi.fn().mockResolvedValue(source),
    preview: vi.fn().mockResolvedValue(state.amountDueNow),
    inspect: vi.fn().mockResolvedValue(null),
    cancel: vi.fn().mockResolvedValue(undefined),
  };
  const lock = { run: vi.fn(async (_key: string, operation: () => Promise<unknown>) => operation()) };
  const processor = {
    ownedChange: vi.fn().mockImplementation(async () => PlanChange.restore(state)),
    execute: vi.fn(async (change: PlanChange) => change.toPublic()),
    refresh: vi.fn(async (change: PlanChange) => change.toPublic()),
  };
  const b = billing as unknown as BillingRepository;
  const r = repository as unknown as PlanChangeRepository;
  const g = gateway as unknown as BillingGateway;
  const pg = planGateway as unknown as PlanChangeGateway;
  const l = lock as unknown as BillingLock;
  const p = processor as unknown as PlanChangeProcessor;

  return {
    billing,
    repository,
    gateway,
    planGateway,
    lock,
    processor,
    preview: new PreviewPlanChangeUseCase(b, r, g, pg, l),
    confirm: new ConfirmPlanChangeUseCase(b, r, g, pg, l, p),
    cancel: new CancelPlanChangeUseCase(b, r, pg, l, p),
    get: new GetPlanChangeUseCase(pg, p),
    sync: new SyncPlanChangeUseCase(b, l, p),
    reconcile: new ReconcilePlanChangeUseCase(r, l, p),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => vi.useRealTimers());

describe('plan change preview', () => {
  it('synchronizes the subscription and saves a five-minute quote with verified provider pricing', async () => {
    const f = fixture();

    expect(await f.preview.execute({ ...actor, planPriceId: target.id })).toMatchObject({
      mode: 'IMMEDIATE',
      status: 'QUOTED',
      amountDueNow: 1000,
      quoteExpiresAt: state.expiresAt,
    });
    expect(f.billing.assertOwner).toHaveBeenCalledTimes(2);
    expect(f.gateway.validatePrice).toHaveBeenCalledWith(target);
    expect(f.repository.create).toHaveBeenCalledWith(expect.any(PlanChange));
    expect(f.planGateway.preview).toHaveBeenCalledWith(expect.objectContaining({ amountDueNow: 0, targetMaxUsers: 5 }));
    expect(f.billing.saveSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      f.billing.currentSubscription.mock.invocationCallOrder[0],
    );
  });

  it('selects a period-end change for a downgrade rather than an immediate upgrade', async () => {
    const f = fixture();
    f.repository.priceInfo
      .mockResolvedValueOnce(sourceInfo)
      .mockResolvedValueOnce({ ...targetInfo, level: 1, amountInCents: 1990 });
    f.planGateway.preview.mockResolvedValueOnce(0);

    expect(await f.preview.execute({ ...actor, planPriceId: target.id })).toMatchObject({
      mode: 'PERIOD_END',
      amountDueNow: 0,
      effectiveAt: new Date(state.periodEnd * 1000),
    });
  });

  it('blocks a pending change and a quote too close to the end of the billing period', async () => {
    const f = fixture();
    f.repository.active.mockResolvedValueOnce(state);

    await expect(f.preview.execute({ ...actor, planPriceId: target.id })).rejects.toThrow('PLAN_CHANGE_CONFLICT');

    f.planGateway.source.mockResolvedValueOnce({ ...source, periodEnd: second + 599 });

    await expect(f.preview.execute({ ...actor, planPriceId: target.id })).rejects.toThrow('PLAN_CHANGE_CONFLICT');
    expect(f.repository.create).not.toHaveBeenCalled();
  });

  it('rejects missing customers and subscriptions without paid access', async () => {
    const f = fixture();
    f.billing.customer.mockResolvedValueOnce({ stripeCustomerId: null });

    await expect(f.preview.execute({ ...actor, planPriceId: target.id })).rejects.toThrow('SUBSCRIPTION_NOT_FOUND');

    f.billing.currentSubscription.mockResolvedValueOnce({ ...subscription, paidThrough: now });

    await expect(f.preview.execute({ ...actor, planPriceId: target.id })).rejects.toThrow('INVALID_SUBSCRIPTION_STATE');
    expect(f.repository.create).not.toHaveBeenCalled();
  });
});

describe('plan change confirmation', () => {
  it('reserves a validated quote before executing a provider change', async () => {
    const f = fixture();

    expect(await f.confirm.execute(action)).toMatchObject({ status: 'PROCESSING' });
    expect(f.repository.reserve).toHaveBeenCalledWith(state.id);
    expect(f.planGateway.preview.mock.invocationCallOrder[0]).toBeLessThan(
      f.repository.reserve.mock.invocationCallOrder[0],
    );
    expect(f.repository.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      f.processor.execute.mock.invocationCallOrder[0],
    );
  });

  it('marks an expired quote without reserving or executing it', async () => {
    const f = fixture();
    f.processor.ownedChange.mockResolvedValueOnce(PlanChange.restore({ ...state, expiresAt: now }));

    expect(await f.confirm.execute(action)).toMatchObject({ status: 'EXPIRED' });
    expect(f.repository.save).toHaveBeenCalledWith(expect.any(PlanChange));
    expect(f.repository.reserve).not.toHaveBeenCalled();
    expect(f.processor.execute).not.toHaveBeenCalled();
  });

  it.each([{ stripePriceId: 'price_changed' }, { amountInCents: 7000 }])(
    'rejects changed provider pricing: %j',
    async (override) => {
      const f = fixture();
      f.billing.availablePrice.mockResolvedValueOnce({ ...target, ...override });

      await expect(f.confirm.execute(action)).rejects.toThrow('PRICE_MISMATCH');
      expect(f.repository.reserve).not.toHaveBeenCalled();
    },
  );

  it('revalidates member capacity and the source billing period before reserving', async () => {
    const f = fixture();
    f.repository.priceInfo.mockResolvedValueOnce({ ...targetInfo, maxUsers: 2 });

    await expect(f.confirm.execute(action)).rejects.toThrow('PRICE_MISMATCH');

    f.planGateway.source.mockResolvedValueOnce({ ...source, periodEnd: source.periodEnd + 1 });
    await expect(f.confirm.execute(action)).rejects.toThrow('PLAN_CHANGE_QUOTE_EXPIRED');

    f.planGateway.preview.mockResolvedValueOnce(state.amountDueNow + 1);
    await expect(f.confirm.execute(action)).rejects.toThrow('PLAN_CHANGE_QUOTE_EXPIRED');
    expect(f.repository.reserve).not.toHaveBeenCalled();
  });

  it('refreshes an already processing change without reserving it twice', async () => {
    const f = fixture();
    f.processor.ownedChange.mockResolvedValueOnce(
      PlanChange.restore({ ...state, status: 'PROCESSING', startedAt: now }),
    );

    expect(await f.confirm.execute(action)).toMatchObject({ status: 'PROCESSING' });
    expect(f.processor.refresh).toHaveBeenCalledTimes(1);
    expect(f.repository.reserve).not.toHaveBeenCalled();
  });
});

describe('plan change cancellation and reconciliation', () => {
  it('cancels a local quote without a remote cancellation and preserves terminal results', async () => {
    const f = fixture();

    expect(await f.cancel.execute(action)).toMatchObject({ status: 'CANCELED' });
    expect(f.repository.save).toHaveBeenCalledTimes(1);
    expect(f.planGateway.cancel).not.toHaveBeenCalled();

    f.processor.ownedChange.mockResolvedValueOnce(PlanChange.restore({ ...state, status: 'APPLIED' }));

    expect(await f.cancel.execute(action)).toMatchObject({ status: 'APPLIED' });
    expect(f.repository.save).toHaveBeenCalledTimes(1);
  });

  it('cancels a remotely scheduled change then refreshes its authoritative outcome', async () => {
    const f = fixture();
    const change = PlanChange.restore({ ...state, mode: 'PERIOD_END', status: 'SCHEDULED' });

    f.processor.ownedChange.mockResolvedValueOnce(change);
    await f.cancel.execute(action);

    expect(f.planGateway.cancel).toHaveBeenCalledWith(change.snapshot());
    expect(f.planGateway.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      f.processor.refresh.mock.invocationCallOrder[0],
    );
  });

  it('does not expose a stale payment secret when remote status has changed', async () => {
    const f = fixture();
    const pending = PlanChange.restore({ ...state, status: 'PENDING_PAYMENT' });

    f.processor.ownedChange.mockResolvedValue(pending);
    f.planGateway.inspect.mockResolvedValueOnce({ status: 'APPLIED', clientSecret: 'stale-secret' });

    expect(await f.get.execute(action)).toMatchObject({ status: 'PENDING_PAYMENT', clientSecret: null });

    f.planGateway.inspect.mockResolvedValueOnce({ status: 'PENDING_PAYMENT', clientSecret: 'fixture-secret' });
    expect(await f.get.execute(action)).toMatchObject({ clientSecret: 'fixture-secret' });
  });

  it('locks explicit sync and background reconciliation and skips absent active changes', async () => {
    const f = fixture();

    await f.sync.execute(action);
    expect(f.processor.refresh).toHaveBeenCalledTimes(1);

    await f.reconcile.execute(actor.organizationId);
    expect(f.processor.refresh).toHaveBeenCalledTimes(1);

    f.repository.active.mockResolvedValueOnce({ ...state, status: 'PROCESSING' });
    await f.reconcile.execute(actor.organizationId);

    expect(f.processor.refresh).toHaveBeenCalledTimes(2);
    expect(f.lock.run).toHaveBeenCalledTimes(3);
  });
});
