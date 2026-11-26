import { describe, expect, it, vi } from 'vitest';

import type { SubscriptionProps } from '../../domain/entities/subscription.entity.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingCustomerProps, BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PaymentMethodGateway } from '../ports/paymentMethodGateway.port.js';
import { GetPaymentMethodUseCase } from './getPaymentMethod.useCase.js';

const actor = { organizationId: 'org', userId: 'owner' };
const customer: BillingCustomerProps = {
  id: 'customer',
  organizationId: 'org',
  stripeCustomerId: 'cus_fixture',
  billingEmail: 'owner@example.invalid',
  billingName: 'Original',
  creationRequestedAt: null,
  invoiceHistorySyncedAt: null,
};
const subscription: SubscriptionProps = {
  id: 'subscription',
  organizationId: 'org',
  planPriceId: 'price',
  stripeSubscriptionId: 'sub_fixture',
  status: 'ACTIVE',
  currentPeriodStart: new Date('2025-01-01'),
  currentPeriodEnd: new Date('2025-02-01'),
  paidThrough: new Date('2025-02-01'),
  cancelAtPeriodEnd: false,
  canceledAt: null,
  endedAt: null,
  stripeCreatedAt: new Date('2025-01-01'),
};
const card = { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 };

function fixture() {
  const assertOwner = vi.fn<BillingRepository['assertOwner']>().mockResolvedValue(undefined);
  const readCustomer = vi.fn<BillingRepository['customer']>().mockResolvedValue(customer);
  const currentSubscription = vi.fn<BillingRepository['currentSubscription']>().mockResolvedValue(subscription);
  const current = vi.fn<PaymentMethodGateway['current']>().mockResolvedValue(card);
  const useCase = new GetPaymentMethodUseCase(
    { assertOwner, customer: readCustomer, currentSubscription } as unknown as BillingRepository,
    { current } as unknown as PaymentMethodGateway,
  );

  return { useCase, assertOwner, readCustomer, currentSubscription, current };
}

describe('GetPaymentMethodUseCase', () => {
  it('does not expose card information to nonowners', async () => {
    const f = fixture();
    f.assertOwner.mockRejectedValueOnce(new BillingError('OWNER_REQUIRED'));

    await expect(f.useCase.execute(actor)).rejects.toThrow('OWNER_REQUIRED');

    expect(f.readCustomer).not.toHaveBeenCalled();
    expect(f.current).not.toHaveBeenCalled();
  });

  it('returns null without calling the gateway when remote billing is incomplete', async () => {
    const f = fixture();
    f.readCustomer.mockResolvedValueOnce({ ...customer, stripeCustomerId: null });
    expect(await f.useCase.execute(actor)).toBeNull();

    f.currentSubscription.mockResolvedValueOnce(null);
    expect(await f.useCase.execute(actor)).toBeNull();

    expect(f.current).not.toHaveBeenCalled();
  });

  it('uses the organization customer and subscription together', async () => {
    const f = fixture();

    expect(await f.useCase.execute(actor)).toEqual(card);
    expect(f.assertOwner).toHaveBeenCalledWith(actor.organizationId, actor.userId);
    expect(f.current).toHaveBeenCalledWith({
      customerId: customer.stripeCustomerId,
      subscriptionId: subscription.stripeSubscriptionId,
    });

    f.current.mockResolvedValueOnce(null);
    expect(await f.useCase.execute(actor)).toBeNull();
  });
});
