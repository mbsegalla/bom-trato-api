import { describe, expect, it, vi } from 'vitest';

import type { SubscriptionProps } from '../../domain/entities/subscription.entity.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import { CancelSubscriptionUseCase } from '../useCases/cancelSubscription.useCase.js';
import { ResumeSubscriptionUseCase } from '../useCases/resumeSubscription.useCase.js';

import { SubscriptionCancellationService } from './subscriptionCancellationService.service.js';

const params = { organizationId: 'org', userId: 'owner' };
const now = new Date('2026-01-01T00:00:00Z');
const end = new Date('2026-02-01T00:00:00Z');
const state: SubscriptionProps = {
  id: 'subscription',
  organizationId: 'org',
  planPriceId: 'price',
  stripeSubscriptionId: 'sub_fixture',
  status: 'ACTIVE',
  currentPeriodStart: now,
  currentPeriodEnd: end,
  paidThrough: end,
  cancelAtPeriodEnd: false,
  canceledAt: null,
  endedAt: null,
  stripeCreatedAt: now,
};
function fixture() {
  const repository = {
    assertOwner: vi.fn<BillingRepository['assertOwner']>().mockResolvedValue(undefined),
    customer: vi.fn<BillingRepository['customer']>().mockResolvedValue({
      id: 'customer',
      organizationId: 'org',
      stripeCustomerId: 'cus_fixture',
      billingEmail: 'owner@example.invalid',
      billingName: 'Fixture',
      creationRequestedAt: null,
      invoiceHistorySyncedAt: null,
    }),
    currentSubscription: vi.fn<BillingRepository['currentSubscription']>().mockResolvedValue(state),
    saveSnapshot: vi.fn<BillingRepository['saveSnapshot']>().mockResolvedValue(undefined),
  };
  const gateway = {
    snapshot: vi.fn<BillingGateway['snapshot']>().mockResolvedValue({ subscriptions: [], invoices: [] }),
    setCancellation: vi.fn<BillingGateway['setCancellation']>().mockResolvedValue(undefined),
  };
  const active = vi.fn<PlanChangeRepository['active']>().mockResolvedValue(null);
  const run = vi.fn(async (_key: string, operation: () => Promise<unknown>) => operation());
  const service = new SubscriptionCancellationService(
    repository as unknown as BillingRepository,
    gateway as unknown as BillingGateway,
    { run } as unknown as BillingLock,
    { active } as unknown as PlanChangeRepository,
  );

  return {
    repository,
    gateway,
    active,
    run,
    service,
  };
}

describe('subscription cancellation and resumption', () => {
  it('requires the owner and checks pending plan changes before remote mutation', async () => {
    const f = fixture();
    const useCase = new CancelSubscriptionUseCase(f.service);
    f.repository.assertOwner.mockRejectedValueOnce(new Error('OWNER_REQUIRED'));

    await expect(useCase.execute(params)).rejects.toThrow('OWNER_REQUIRED');
    expect(f.run).not.toHaveBeenCalled();

    f.active.mockResolvedValueOnce({ id: 'pending' } as NonNullable<
      Awaited<ReturnType<PlanChangeRepository['active']>>
    >);

    await expect(useCase.execute(params)).rejects.toThrow('PLAN_CHANGE_CONFLICT');
    expect(f.gateway.snapshot).not.toHaveBeenCalled();
    expect(f.gateway.setCancellation).not.toHaveBeenCalled();
  });

  it('synchronizes before and after cancellation under the organization lock', async () => {
    const f = fixture();

    await new CancelSubscriptionUseCase(f.service).execute(params);

    expect(f.run).toHaveBeenCalledWith('organization:org', expect.any(Function));
    expect(f.gateway.setCancellation).toHaveBeenCalledWith('sub_fixture', true);
    expect(f.repository.saveSnapshot).toHaveBeenCalledTimes(2);
    expect(f.repository.saveSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      f.gateway.setCancellation.mock.invocationCallOrder[0],
    );
    expect(f.gateway.setCancellation.mock.invocationCallOrder[0]).toBeLessThan(
      f.repository.saveSnapshot.mock.invocationCallOrder[1],
    );
  });

  it('does not repeat an already requested cancellation and resumes the original subscription', async () => {
    const f = fixture();
    f.repository.currentSubscription.mockResolvedValue({ ...state, cancelAtPeriodEnd: true });

    await new CancelSubscriptionUseCase(f.service).execute(params);

    expect(f.gateway.setCancellation).not.toHaveBeenCalled();

    await new ResumeSubscriptionUseCase(f.service).execute(params);

    expect(f.gateway.setCancellation).toHaveBeenCalledTimes(1);
    expect(f.gateway.setCancellation).toHaveBeenCalledWith('sub_fixture', false);
  });

  it('does not attempt cancellation for a missing or terminal subscription', async () => {
    const f = fixture();
    f.repository.currentSubscription
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...state, status: 'CANCELED' });
    const useCase = new CancelSubscriptionUseCase(f.service);

    await expect(useCase.execute(params)).rejects.toThrow('SUBSCRIPTION_NOT_FOUND');
    await expect(useCase.execute(params)).rejects.toThrow('INVALID_SUBSCRIPTION_STATE');
    expect(f.gateway.setCancellation).not.toHaveBeenCalled();
  });
});
