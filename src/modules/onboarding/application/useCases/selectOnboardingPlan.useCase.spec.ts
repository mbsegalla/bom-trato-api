import { describe, expect, it, vi } from 'vitest';

import type { BillingGateway } from '../../../billing/application/ports/billingGateway.port.js';
import type { BillingLock } from '../../../billing/application/ports/billingLock.port.js';
import type { BillingRepository } from '../../../billing/domain/repositories/billing.repository.js';
import type { OnboardingRepository } from '../../domain/repositories/onboarding.repository.js';
import type { OnboardingApplicationService } from '../services/onboardingApplicationService.service.js';

import { SelectOnboardingPlanUseCase } from './selectOnboardingPlan.useCase.js';

const actor = { userId: 'owner', organizationId: 'org', planPriceId: 'target' };
const attempt = { id: 'attempt', planPriceId: 'previous', stripeSessionId: 'cs_fixture' };
const session = { stripeSessionId: 'cs_fixture', status: 'OPEN', clientSecret: null };
const nextState = { step: 'PAYMENT', organizationId: actor.organizationId, selectedPlanPriceId: actor.planPriceId };

function fixture() {
  const repository = { selectPlan: vi.fn().mockResolvedValue(undefined) };
  const application = { state: vi.fn().mockResolvedValue(nextState) };
  const billing = {
    assertOwner: vi.fn().mockResolvedValue(undefined),
    availablePrice: vi.fn().mockResolvedValue({ id: actor.planPriceId }),
    pendingCheckout: vi.fn().mockResolvedValue(null),
    customer: vi.fn().mockResolvedValue({ stripeCustomerId: 'cus_fixture' }),
    attachCheckout: vi.fn().mockResolvedValue(undefined),
    closeCheckout: vi.fn().mockResolvedValue(undefined),
  };
  const gateway = {
    checkout: vi.fn().mockResolvedValue(session),
    findCheckout: vi.fn().mockResolvedValue(null),
    expireCheckout: vi.fn().mockResolvedValue({ ...session, status: 'EXPIRED' }),
  };
  const lock = {
    run: vi.fn(async (_key: string, operation: () => Promise<unknown>) => operation()),
  };
  const useCase = new SelectOnboardingPlanUseCase(
    repository as unknown as OnboardingRepository,
    application as unknown as OnboardingApplicationService,
    billing as unknown as BillingRepository,
    gateway as unknown as BillingGateway,
    lock as unknown as BillingLock,
  );

  return {
    repository,
    application,
    billing,
    gateway,
    lock,
    execute: () => useCase.execute(actor.userId, actor.organizationId, actor.planPriceId),
  };
}

describe('SelectOnboardingPlanUseCase', () => {
  it('checks owner and price before locking and persisting the selected plan', async () => {
    const f = fixture();

    expect(await f.execute()).toEqual(nextState);
    expect(f.billing.assertOwner).toHaveBeenCalledWith(actor.organizationId, actor.userId);
    expect(f.billing.availablePrice).toHaveBeenCalledWith(actor.planPriceId);
    expect(f.lock.run).toHaveBeenCalledWith('organization:org', expect.any(Function));
    expect(f.repository.selectPlan).toHaveBeenCalledWith(actor.userId, actor.organizationId, actor.planPriceId);
    expect(f.application.state).toHaveBeenCalledWith(actor.userId, actor.organizationId);

    expect(f.billing.assertOwner.mock.invocationCallOrder[0]).toBeLessThan(
      f.billing.availablePrice.mock.invocationCallOrder[0],
    );
    expect(f.lock.run.mock.invocationCallOrder[0]).toBeLessThan(f.repository.selectPlan.mock.invocationCallOrder[0]);
  });

  it.each(['assertOwner', 'availablePrice'] as const)('stops before the lock if %s fails', async (method) => {
    const f = fixture();
    f.billing[method].mockRejectedValueOnce(new Error('Fixture denied'));

    await expect(f.execute()).rejects.toThrow('Fixture denied');

    expect(f.lock.run).not.toHaveBeenCalled();
    expect(f.repository.selectPlan).not.toHaveBeenCalled();
    expect(f.application.state).not.toHaveBeenCalled();
  });

  it('does not expire a pending checkout for the same selected price', async () => {
    const f = fixture();
    f.billing.pendingCheckout.mockResolvedValueOnce({ ...attempt, planPriceId: actor.planPriceId });

    await f.execute();

    expect(f.gateway.checkout).not.toHaveBeenCalled();
    expect(f.billing.closeCheckout).not.toHaveBeenCalled();
    expect(f.repository.selectPlan).toHaveBeenCalledTimes(1);
  });

  it('expires the conflicting open checkout before selecting a different plan', async () => {
    const f = fixture();
    f.billing.pendingCheckout.mockResolvedValueOnce(attempt);

    await f.execute();

    expect(f.gateway.checkout).toHaveBeenCalledWith(attempt.stripeSessionId);
    expect(f.gateway.expireCheckout).toHaveBeenCalledWith(attempt.stripeSessionId);
    expect(f.billing.closeCheckout).toHaveBeenCalledWith(attempt.id, 'EXPIRED');
    expect(f.billing.closeCheckout.mock.invocationCallOrder[0]).toBeLessThan(
      f.repository.selectPlan.mock.invocationCallOrder[0],
    );
  });

  it('recovers an unattached remote session before closing it', async () => {
    const f = fixture();
    f.billing.pendingCheckout.mockResolvedValueOnce({ ...attempt, stripeSessionId: null });
    f.gateway.findCheckout.mockResolvedValueOnce({ ...session, status: 'EXPIRED' });

    await f.execute();

    expect(f.gateway.findCheckout).toHaveBeenCalledWith('cus_fixture', attempt.id);
    expect(f.billing.attachCheckout).toHaveBeenCalledWith(attempt.id, session.stripeSessionId);
    expect(f.billing.closeCheckout).toHaveBeenCalledWith(attempt.id, 'EXPIRED');
    expect(f.gateway.expireCheckout).not.toHaveBeenCalled();
  });

  it('closes abandoned local attempts when no remote customer or session exists', async () => {
    const f = fixture();
    f.billing.pendingCheckout.mockResolvedValueOnce({ ...attempt, stripeSessionId: null });
    f.billing.customer.mockResolvedValueOnce({ stripeCustomerId: null });

    await f.execute();

    expect(f.gateway.findCheckout).not.toHaveBeenCalled();
    expect(f.billing.closeCheckout).toHaveBeenCalledWith(attempt.id, 'EXPIRED');
    expect(f.repository.selectPlan).toHaveBeenCalledTimes(1);
  });

  it.each(['already-complete', 'completed-during-expiry'])(
    'preserves a completed payment instead of starting another: %s',
    async (scenario) => {
      const f = fixture();
      f.billing.pendingCheckout.mockResolvedValueOnce(attempt);

      if (scenario === 'already-complete') {
        f.gateway.checkout.mockResolvedValueOnce({ ...session, status: 'COMPLETE' });
      } else {
        f.gateway.expireCheckout.mockResolvedValueOnce({ ...session, status: 'COMPLETE' });
      }

      await expect(f.execute()).rejects.toThrow('SUBSCRIPTION_EXISTS');
      expect(f.billing.closeCheckout).toHaveBeenCalledWith(attempt.id, 'COMPLETE');
      expect(f.repository.selectPlan).not.toHaveBeenCalled();
      expect(f.application.state).not.toHaveBeenCalled();
    },
  );

  it('requires reconciliation if Stripe does not confirm the requested expiration', async () => {
    const f = fixture();
    f.billing.pendingCheckout.mockResolvedValueOnce(attempt);
    f.gateway.expireCheckout.mockResolvedValueOnce(session);

    await expect(f.execute()).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(f.billing.closeCheckout).not.toHaveBeenCalled();
    expect(f.repository.selectPlan).not.toHaveBeenCalled();
  });
});
