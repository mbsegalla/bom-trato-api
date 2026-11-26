import { describe, expect, it, vi } from 'vitest';

import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingCustomerProps, BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import { UpdateBillingCustomerNameUseCase } from './updateBillingCustomerName.useCase.js';

const customer: BillingCustomerProps = {
  id: 'customer',
  organizationId: 'org',
  stripeCustomerId: 'cus_fixture',
  billingEmail: 'owner@example.invalid',
  billingName: 'Original',
  creationRequestedAt: null,
  invoiceHistorySyncedAt: null,
};
const params = { organizationId: customer.organizationId, name: 'Updated' };

function fixture() {
  const keys: string[] = [];
  const lock: BillingLock = {
    async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
      keys.push(key);
      return operation();
    },
  };
  const readCustomer = vi.fn<BillingRepository['customer']>().mockResolvedValue(customer);
  const setCustomerName = vi.fn<BillingRepository['setCustomerName']>().mockResolvedValue(undefined);
  const updateCustomerName = vi.fn<BillingGateway['updateCustomerName']>().mockResolvedValue(undefined);
  const useCase = new UpdateBillingCustomerNameUseCase(
    { customer: readCustomer, setCustomerName } as unknown as BillingRepository,
    { updateCustomerName } as unknown as BillingGateway,
    lock,
  );

  return { useCase, keys, readCustomer, setCustomerName, updateCustomerName };
}

describe('UpdateBillingCustomerNameUseCase', () => {
  it('updates the remote and local customer under the organization lock', async () => {
    const f = fixture();

    await f.useCase.execute(params);

    expect(f.keys).toEqual(['organization:org']);
    expect(f.updateCustomerName).toHaveBeenCalledWith(customer.stripeCustomerId, params.name);
    expect(f.setCustomerName).toHaveBeenCalledWith(customer.id, params.name);
    expect(f.updateCustomerName.mock.invocationCallOrder[0]!).toBeLessThan(f.setCustomerName.mock.invocationCallOrder[0]!);
  });

  it('does not repeat writes when the name is unchanged', async () => {
    const f = fixture();

    await f.useCase.execute({ ...params, name: customer.billingName });

    expect(f.updateCustomerName).not.toHaveBeenCalled();
    expect(f.setCustomerName).not.toHaveBeenCalled();
  });

  it('updates only local billing when remote creation has not begun', async () => {
    const f = fixture();
    f.readCustomer.mockResolvedValueOnce({ ...customer, stripeCustomerId: null });

    await f.useCase.execute(params);

    expect(f.updateCustomerName).not.toHaveBeenCalled();
    expect(f.setCustomerName).toHaveBeenCalledWith(customer.id, params.name);
  });

  it('blocks a write while remote customer creation needs reconciliation', async () => {
    const f = fixture();
    f.readCustomer.mockResolvedValueOnce({ ...customer, stripeCustomerId: null, creationRequestedAt: new Date() });

    await expect(f.useCase.execute(params)).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');

    expect(f.updateCustomerName).not.toHaveBeenCalled();
    expect(f.setCustomerName).not.toHaveBeenCalled();
  });

  it('preserves domain errors and wraps unexpected remote failures without writing locally', async () => {
    const f = fixture();
    const domainError = new BillingError('BILLING_BUSY');
    f.updateCustomerName.mockRejectedValueOnce(domainError);

    await expect(f.useCase.execute(params)).rejects.toBe(domainError);

    const cause = new Error('gateway unavailable');
    f.updateCustomerName.mockRejectedValueOnce(cause);

    await expect(f.useCase.execute(params)).rejects.toMatchObject({ code: 'BILLING_WRITE_FAILED', cause });
    expect(f.setCustomerName).not.toHaveBeenCalled();
  });
});
