import { describe, expect, it, vi } from 'vitest';

import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import type { BillingRepository, CheckoutAttemptState } from '../../domain/repositories/billing.repository.js';
import { StartCheckoutUseCase } from './startCheckout.useCase.js';

const actor = { organizationId: 'org', userId: 'owner', planPriceId: 'price' };
function fixture() {
  const attempt: CheckoutAttemptState = {
    id: 'attempt',
    organizationId: 'org',
    planPriceId: 'price',
    stripePriceId: 'price_fixture',
    stripeSessionId: 'cs_fixture',
    returnUrl: 'https://web.example.invalid/billing/return',
    expiresAt: new Date(Date.now() + 7200000),
  };
  const repository = {
    assertOwner: vi.fn<BillingRepository['assertOwner']>().mockResolvedValue(undefined),
    availablePrice: vi.fn<BillingRepository['availablePrice']>().mockResolvedValue({
      id: 'price',
      stripePriceId: 'price_fixture',
      stripeProductId: 'prod_fixture',
      amountInCents: 4900,
      currency: 'brl',
      interval: 'MONTH',
      intervalCount: 1,
    }),
    customer: vi.fn<BillingRepository['customer']>().mockResolvedValue({
      id: 'customer',
      organizationId: 'org',
      stripeCustomerId: 'cus_fixture',
      billingEmail: 'owner@example.invalid',
      billingName: 'Fixture',
      creationRequestedAt: null,
      invoiceHistorySyncedAt: null,
    }),
    markCustomerCreation: vi.fn<BillingRepository['markCustomerCreation']>().mockResolvedValue(undefined),
    setCustomerId: vi.fn<BillingRepository['setCustomerId']>().mockResolvedValue(undefined),
    handleDeletedCustomer: vi.fn<BillingRepository['handleDeletedCustomer']>().mockResolvedValue(undefined),
    saveSnapshot: vi.fn<BillingRepository['saveSnapshot']>().mockResolvedValue(undefined),
    pendingCheckout: vi.fn<BillingRepository['pendingCheckout']>().mockResolvedValue(attempt),
    attachCheckout: vi.fn<BillingRepository['attachCheckout']>().mockResolvedValue(undefined),
    closeCheckout: vi.fn<BillingRepository['closeCheckout']>().mockResolvedValue(undefined),
    createCheckout: vi.fn<BillingRepository['createCheckout']>().mockImplementation(async (data) => ({ ...data, stripeSessionId: null })),
  };
  const gateway = {
    findCustomer: vi.fn<BillingGateway['findCustomer']>().mockResolvedValue(null),
    createCustomer: vi.fn<BillingGateway['createCustomer']>().mockResolvedValue('cus_new'),
    findCheckout: vi.fn<BillingGateway['findCheckout']>().mockResolvedValue(null),
    customerState: vi.fn<BillingGateway['customerState']>().mockResolvedValue('ACTIVE'),
    snapshot: vi.fn<BillingGateway['snapshot']>().mockResolvedValue({ subscriptions: [], invoices: [] }),
    checkout: vi.fn<BillingGateway['checkout']>().mockResolvedValue({
      stripeSessionId: 'cs_fixture',
      status: 'OPEN',
      clientSecret: 'fixture-secret'
    }),
    validatePrice: vi.fn<BillingGateway['validatePrice']>().mockResolvedValue(undefined),
    createCheckout: vi.fn<BillingGateway['createCheckout']>().mockResolvedValue({
      stripeSessionId: 'cs_new',
      status: 'OPEN',
      clientSecret: 'new-secret'
    }),
  };
  const run = vi.fn(async (_key: string, operation: () => Promise<unknown>) => operation());
  const useCase = new StartCheckoutUseCase(repository as unknown as BillingRepository, gateway as unknown as BillingGateway,
    { run } as unknown as BillingLock, 'https://web.example.invalid');

  return {
    useCase,
    repository,
    gateway,
    run,
    attempt
  };
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
    f.gateway.checkout.mockResolvedValueOnce({
      stripeSessionId: 'cs_fixture',
      status: 'COMPLETE',
      clientSecret: null
    });

    await expect(f.useCase.execute(actor)).rejects.toThrow('SUBSCRIPTION_EXISTS');
    expect(f.repository.closeCheckout).toHaveBeenCalledWith('attempt', 'COMPLETE');
    expect(f.gateway.createCheckout).not.toHaveBeenCalled();
  });

  it('persists the new attempt and its scoped return URL before provider creation', async () => {
    const f = fixture();
    f.repository.pendingCheckout.mockResolvedValueOnce(null);

    const result = await f.useCase.execute(actor);

    expect(f.repository.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      id: result.attemptId,
      organizationId: 'org',
      planPriceId: 'price',
      returnUrl: 'https://web.example.invalid/billing/return?organizationId=org',
    }));
    expect(f.gateway.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'cus_fixture',
      attempt: expect.objectContaining({ id: result.attemptId }),
    }));
    expect(f.repository.attachCheckout).toHaveBeenCalledWith(result.attemptId, 'cs_new');
  });
  it('fails before entering the billing lock if the selected price is unavailable', async () => {
    const f = fixture();
    f.repository.availablePrice.mockRejectedValueOnce(new Error('PLAN_UNAVAILABLE'));
    await expect(f.useCase.execute(actor)).rejects.toThrow('PLAN_UNAVAILABLE');
    expect(f.run).not.toHaveBeenCalled();
    expect(f.gateway.customerState).not.toHaveBeenCalled();
  });

  function unbound(requestedAt: Date | null) {
    return {
      id: 'customer', organizationId: 'org', stripeCustomerId: null,
      billingEmail: 'owner@example.invalid', billingName: 'Fixture',
      creationRequestedAt: requestedAt, invoiceHistorySyncedAt: null,
    };
  }

  it('persists a customer creation checkpoint and recovers an existing provider identity without creating another', async () => {
    const f = fixture();
    const requested = unbound(new Date(Date.now() - 24 * 3600000));
    f.repository.customer.mockResolvedValue(requested);
    f.gateway.findCustomer.mockResolvedValueOnce('cus_recovered');

    await expect(f.useCase.execute(actor)).resolves.toEqual({ attemptId: 'attempt', clientSecret: 'fixture-secret' });
    expect(f.repository.markCustomerCreation).toHaveBeenCalledWith('customer', expect.any(Date));
    expect(f.gateway.findCustomer).toHaveBeenCalledWith(requested);
    expect(f.repository.setCustomerId).toHaveBeenCalledWith('customer', 'cus_recovered');
    expect(f.gateway.createCustomer).not.toHaveBeenCalled();
    expect(f.gateway.snapshot).toHaveBeenCalledWith('cus_recovered');
  });

  it('creates a customer only after the persisted recent checkpoint and stores its identifier before fetching the snapshot', async () => {
    const f = fixture();
    const requested = unbound(new Date(Date.now() - 22 * 3600000));
    f.repository.customer.mockResolvedValueOnce(unbound(null)).mockResolvedValueOnce(requested);

    await f.useCase.execute(actor);

    expect(f.gateway.customerState).not.toHaveBeenCalled();
    expect(f.gateway.createCustomer).toHaveBeenCalledWith(requested);
    expect(f.repository.setCustomerId).toHaveBeenCalledWith('customer', 'cus_new');
    expect(f.repository.markCustomerCreation.mock.invocationCallOrder[0]).toBeLessThan(f.gateway.createCustomer.mock.invocationCallOrder[0]!);
    expect(f.repository.setCustomerId.mock.invocationCallOrder[0]).toBeLessThan(f.gateway.snapshot.mock.invocationCallOrder[0]!);
    expect(f.gateway.snapshot).toHaveBeenCalledWith('cus_new');
  });

  it.each([null, new Date(Date.now() - 24 * 3600000)])('does not create a new remote customer without a safe checkpoint: %s', async (requestedAt) => {
    const f = fixture();
    f.repository.customer.mockResolvedValue(unbound(requestedAt));
    await expect(f.useCase.execute(actor)).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(f.gateway.createCustomer).not.toHaveBeenCalled();
    expect(f.repository.setCustomerId).not.toHaveBeenCalled();
    expect(f.gateway.snapshot).not.toHaveBeenCalled();
  });

  it('detaches a deleted customer before recovering its replacement', async () => {
    const f = fixture();
    const requested = unbound(new Date());
    f.repository.customer.mockResolvedValueOnce({ ...requested, stripeCustomerId: 'cus_deleted' }).mockResolvedValue(requested);
    f.gateway.customerState.mockResolvedValueOnce('DELETED');
    f.gateway.findCustomer.mockResolvedValueOnce('cus_replacement');

    await f.useCase.execute(actor);

    expect(f.repository.handleDeletedCustomer).toHaveBeenCalledWith({
      organizationId: 'org', stripeCustomerId: 'cus_deleted', deletedAt: expect.any(Date),
    });
    expect(f.repository.setCustomerId).toHaveBeenCalledWith('customer', 'cus_replacement');
    expect(f.gateway.snapshot).toHaveBeenCalledWith('cus_replacement');
  });

  it.each(['ACTIVE', 'PAST_DUE', 'TRIALING', 'INCOMPLETE'] as const)('blocks duplicate checkout for a remote %s subscription after saving the snapshot', async (status) => {
    const f = fixture();
    const now = new Date();
    const snapshot = { subscriptions: [{
      stripeSubscriptionId: 'sub_fixture', stripePriceId: 'price_fixture', status,
      currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 86400000),
      cancelAtPeriodEnd: false, canceledAt: null, endedAt: null, stripeCreatedAt: now,
    }], invoices: [] };
    f.gateway.snapshot.mockResolvedValueOnce(snapshot);
    await expect(f.useCase.execute(actor)).rejects.toThrow('SUBSCRIPTION_EXISTS');
    expect(f.repository.saveSnapshot).toHaveBeenCalledWith({ organizationId: 'org', snapshot });
    expect(f.repository.pendingCheckout).not.toHaveBeenCalled();
    expect(f.gateway.createCheckout).not.toHaveBeenCalled();
  });

  it('recovers a pending session by the original attempt identity when no session ID was persisted', async () => {
    const f = fixture();
    f.repository.pendingCheckout.mockResolvedValueOnce({ ...f.attempt, stripeSessionId: null });
    f.gateway.findCheckout.mockResolvedValueOnce({ stripeSessionId: 'cs_recovered', status: 'OPEN', clientSecret: 'recovered-secret' });

    await expect(f.useCase.execute(actor)).resolves.toEqual({ attemptId: 'attempt', clientSecret: 'recovered-secret' });
    expect(f.gateway.findCheckout).toHaveBeenCalledWith('cus_fixture', 'attempt');
    expect(f.gateway.checkout).not.toHaveBeenCalled();
    expect(f.repository.attachCheckout).toHaveBeenCalledWith('attempt', 'cs_recovered');
    expect(f.gateway.createCheckout).not.toHaveBeenCalled();
  });

  it('closes an expired provider session before creating a fresh attempt', async () => {
    const f = fixture();
    f.gateway.checkout.mockResolvedValueOnce({ stripeSessionId: 'cs_fixture', status: 'EXPIRED', clientSecret: null });
    const result = await f.useCase.execute(actor);
    expect(result.attemptId).not.toBe('attempt');
    expect(f.repository.closeCheckout).toHaveBeenCalledWith('attempt', 'EXPIRED');
    expect(f.gateway.validatePrice).toHaveBeenCalledTimes(1);
    expect(f.repository.createCheckout).toHaveBeenCalledTimes(1);
    expect(f.repository.closeCheckout.mock.invocationCallOrder[0]).toBeLessThan(f.repository.createCheckout.mock.invocationCallOrder[0]!);
  });

  it('replaces an expired local attempt only after finding no remote checkout', async () => {
    const f = fixture();
    f.repository.pendingCheckout.mockResolvedValueOnce({ ...f.attempt, stripeSessionId: null, expiresAt: new Date(Date.now() - 1000) });
    const result = await f.useCase.execute(actor);
    expect(result.attemptId).not.toBe('attempt');
    expect(f.gateway.findCheckout).toHaveBeenCalledWith('cus_fixture', 'attempt');
    expect(f.repository.closeCheckout).toHaveBeenCalledWith('attempt', 'EXPIRED');
    expect(f.repository.createCheckout).toHaveBeenCalledTimes(1);
  });

  it('reuses a valid local reservation without creating a second attempt', async () => {
    const f = fixture();
    const attempt = { ...f.attempt, stripeSessionId: null };
    f.repository.pendingCheckout.mockResolvedValueOnce(attempt);
    await expect(f.useCase.execute(actor)).resolves.toEqual({ attemptId: 'attempt', clientSecret: 'new-secret' });
    expect(f.gateway.createCheckout).toHaveBeenCalledWith({ customerId: 'cus_fixture', attempt });
    expect(f.repository.createCheckout).not.toHaveBeenCalled();
    expect(f.gateway.validatePrice).not.toHaveBeenCalled();
  });

  it('rejects a different price while an unmatched reservation is still valid', async () => {
    const f = fixture();
    f.repository.pendingCheckout.mockResolvedValueOnce({ ...f.attempt, stripeSessionId: null });
    await expect(f.useCase.execute({ ...actor, planPriceId: 'other' })).rejects.toThrow('CHECKOUT_IN_PROGRESS');
    expect(f.gateway.createCheckout).not.toHaveBeenCalled();
  });

  it('does not contact the provider for a reservation with insufficient remaining validity', async () => {
    const f = fixture();
    f.repository.pendingCheckout.mockResolvedValueOnce({ ...f.attempt, stripeSessionId: null, expiresAt: new Date(Date.now() + 29 * 60000) });
    await expect(f.useCase.execute(actor)).rejects.toThrow('CHECKOUT_EXPIRED');
    expect(f.gateway.createCheckout).not.toHaveBeenCalled();
    expect(f.repository.closeCheckout).not.toHaveBeenCalled();
  });

  it('requires reconciliation for an open existing session without a client secret', async () => {
    const f = fixture();
    f.gateway.checkout.mockResolvedValueOnce({ stripeSessionId: 'cs_fixture', status: 'OPEN', clientSecret: null });
    await expect(f.useCase.execute(actor)).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(f.repository.attachCheckout).toHaveBeenCalledWith('attempt', 'cs_fixture');
    expect(f.gateway.createCheckout).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'OPEN' as const, clientSecret: null },
    { status: 'COMPLETE' as const, clientSecret: null },
    { status: 'EXPIRED' as const, clientSecret: null },
  ])('keeps the new session checkpoint for unsafe provider results: %j', async (result) => {
    const f = fixture();
    f.repository.pendingCheckout.mockResolvedValueOnce(null);
    f.gateway.createCheckout.mockResolvedValueOnce({ stripeSessionId: 'cs_ambiguous', ...result });
    await expect(f.useCase.execute(actor)).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(f.repository.attachCheckout).toHaveBeenCalledWith(expect.any(String), 'cs_ambiguous');
    expect(f.repository.createCheckout).toHaveBeenCalledTimes(1);
  });
});
