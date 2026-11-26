import { describe, expect, it, vi } from 'vitest';

import type { BillingCustomerProps, BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import { HandleDeletedBillingCustomerUseCase } from './handleDeletedBillingCustomer.useCase.js';

const customer: BillingCustomerProps = {
  id: 'customer',
  organizationId: 'org',
  stripeCustomerId: 'cus_fixture',
  billingEmail: 'owner@example.invalid',
  billingName: 'Original',
  creationRequestedAt: null,
  invoiceHistorySyncedAt: null,
};
const params = { stripeCustomerId: 'cus_fixture', deletedAt: new Date('2025-01-01') };

function fixture() {
  const keys: string[] = [];
  const lock: BillingLock = {
    async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
      keys.push(key);
      return operation();
    },
  };
  const customerByStripeId = vi.fn<BillingRepository['customerByStripeId']>().mockResolvedValue(customer);
  const handleDeletedCustomer = vi.fn<BillingRepository['handleDeletedCustomer']>().mockResolvedValue(undefined);
  const useCase = new HandleDeletedBillingCustomerUseCase(
    { customerByStripeId, handleDeletedCustomer } as unknown as BillingRepository,
    lock,
  );

  return { useCase, keys, customerByStripeId, handleDeletedCustomer };
}

describe('HandleDeletedBillingCustomerUseCase', () => {
  it('ignores unknown and stale customer deletion events', async () => {
    const f = fixture();
    f.customerByStripeId.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...customer, stripeCustomerId: 'cus_new' });

    await f.useCase.execute(params);
    await f.useCase.execute(params);

    expect(f.keys).toEqual([]);
    expect(f.handleDeletedCustomer).not.toHaveBeenCalled();
  });

  it('handles a matching customer under the correct organization lock', async () => {
    const f = fixture();

    await f.useCase.execute(params);

    expect(f.customerByStripeId).toHaveBeenCalledWith(params.stripeCustomerId);
    expect(f.keys).toEqual(['organization:org']);
    expect(f.handleDeletedCustomer).toHaveBeenCalledWith({ ...params, organizationId: customer.organizationId });
  });
});
