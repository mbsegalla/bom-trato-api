import { describe, expect, it, vi } from 'vitest';

import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import type { BillingRepository, CheckoutAttemptState } from '../../domain/repositories/billing.repository.js';
import { StartCheckoutUseCase } from './startCheckout.useCase.js';

const actor = { organizationId: 'org', userId: 'owner', planPriceId: 'price' };
function fixture() {
  const attempt: CheckoutAttemptState = {
    id: 'attempt', organizationId: 'org', planPriceId: 'price', stripePriceId: 'price_fixture',
    stripeSessionId: 'cs_fixture', returnUrl: 'https://web.example.invalid/billing/return', expiresAt: new Date(Date.now() + 7200000),
  };
  const repository = {
    assertOwner: vi.fn<BillingRepository['assertOwner']>().mockResolvedValue(undefined),
    availablePrice: vi.fn<BillingRepository['availablePrice']>().mockResolvedValue({
      id: 'price', stripePriceId: 'price_fixture', stripeProductId: 'prod_fixture', amountInCents: 4900,
      currency: 'brl', interval: 'MONTH', intervalCount: 1,
    }),
    customer: vi.fn<BillingRepository['customer']>().mockResolvedValue({
      id: 'customer', organizationId: 'org', stripeCustomerId: 'cus_fixture',
      billingEmail: 'owner@example.invalid', billingName: 'Fixture', creationRequestedAt: null, invoiceHistorySyncedAt: null,
    }),
    saveSnapshot: vi.fn<BillingRepository['saveSnapshot']>().mockResolvedValue(undefined),
    pendingCheckout: vi.fn<BillingRepository['pendingCheckout']>().mockResolvedValue(attempt),
    attachCheckout: vi.fn<BillingRepository['attachCheckout']>().mockResolvedValue(undefined),
    closeCheckout: vi.fn<BillingRepository['closeCheckout']>().mockResolvedValue(undefined),
    createCheckout: vi.fn<BillingRepository['createCheckout']>().mockImplementation(async (data) => ({ ...data, stripeSessionId: null })),
  };
  const gateway = {
    customerState: vi.fn<BillingGateway['customerState']>().mockResolvedValue('ACTIVE'),
    snapshot: vi.fn<BillingGateway['snapshot']>().mockResolvedValue({ subscriptions: [], invoices: [] }),
    checkout: vi.fn<BillingGateway['checkout']>().mockResolvedValue({ stripeSessionId: 'cs_fixture', status: 'OPEN', clientSecret: 'fixture-secret' }),
    validatePrice: vi.fn<BillingGateway['validatePrice']>().mockResolvedValue(undefined),
    createCheckout: vi.fn<BillingGateway['createCheckout']>().mockResolvedValue({ stripeSessionId: 'cs_new', status: 'OPEN', clientSecret: 'new-secret' }),
  };
  const run = vi.fn(async (_key: string, operation: () => Promise<unknown>) => operation());
  const useCase = new StartCheckoutUseCase(repository as unknown as BillingRepository, gateway as unknown as BillingGateway,
    { run } as unknown as BillingLock, 'https://web.example.invalid');
  return { useCase, repository, gateway, run, attempt };
}
describe('StartCheckoutUseCase', () => {
  it('checks ownership before any remote or locked checkout operation', async () => {
    const f = fixture();
    f.repository.assertOwner.mockRejectedValueOnce(new Error('OWNER_REQUIRED'));
    await expect(f.useCase.execute(actor)).rejects.toThrow('OWNER_REQUIRED');
    expect(f.run).not.toHaveBeenCalled();
    expect(f.gateway.snapshot).not.toHaveBeenCalled();
  });
  it('reuses an open checkout for the same plan under the organization lock', async () => {
    const f = fixture();
    await expect(f.useCase.execute(actor)).resolves.toEqual({ attemptId: 'attempt', clientSecret: 'fixture-secret' });
    expect(f.run).toHaveBeenCalledWith('organization:org', expect.any(Function));
    expect(f.repository.attachCheckout).toHaveBeenCalledWith('attempt', 'cs_fixture');
    expect(f.gateway.createCheckout).not.toHaveBeenCalled();
  });
  it('refuses a different plan while an open attempt exists', async () => {
    const f = fixture();
    await expect(f.useCase.execute({ ...actor, planPriceId: 'other' })).rejects.toThrow('CHECKOUT_IN_PROGRESS');
    expect(f.repository.createCheckout).not.toHaveBeenCalled();
    expect(f.gateway.createCheckout).not.toHaveBeenCalled();
  });
  it('never creates another checkout after a completed session', async () => {
    const f = fixture();
    f.gateway.checkout.mockResolvedValueOnce({ stripeSessionId: 'cs_fixture', status: 'COMPLETE', clientSecret: null });
    await expect(f.useCase.execute(actor)).rejects.toThrow('SUBSCRIPTION_EXISTS');
    expect(f.repository.closeCheckout).toHaveBeenCalledWith('attempt', 'COMPLETE');
    expect(f.gateway.createCheckout).not.toHaveBeenCalled();
  });
  it('persists the new attempt and its scoped return URL before provider creation', async () => {
    const f = fixture();
    f.repository.pendingCheckout.mockResolvedValueOnce(null);
    const result = await f.useCase.execute(actor);
    expect(f.repository.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      id: result.attemptId, organizationId: 'org', planPriceId: 'price',
      returnUrl: 'https://web.example.invalid/billing/return?organizationId=org',
    }));
    expect(f.gateway.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'cus_fixture', attempt: expect.objectContaining({ id: result.attemptId }),
    }));
    expect(f.repository.attachCheckout).toHaveBeenCalledWith(result.attemptId, 'cs_new');
  });
});
