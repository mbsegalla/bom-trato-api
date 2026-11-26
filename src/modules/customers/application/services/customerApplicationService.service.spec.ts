import { describe, expect, it, vi } from 'vitest';

import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { CustomerRepository } from '../../domain/repositories/customer.repository.js';
import type { CustomerTransaction, CustomerUnitOfWork } from '../ports/customerUnitOfWork.port.js';
import { CustomerApplicationService } from './customerApplicationService.service.js';

const actor = { organizationId: 'org', userId: 'owner' };
const allowed: OrganizationAccessContext = {
  isMember: true,
  verified: true,
  hasPlatformAccess: true,
  source: 'TRIAL',
  billingNeedsReconciliation: false,
};
function fixture(access = allowed) {
  const customers = {
    findById: vi.fn<CustomerRepository['findById']>().mockResolvedValue(null),
    findByEmail: vi.fn<CustomerRepository['findByEmail']>().mockResolvedValue(null),
  };
  const tx = { customers, access } as unknown as CustomerTransaction;
  const run = vi.fn(async (_actor: typeof actor, operation: (tx: CustomerTransaction) => Promise<unknown>) => operation(tx));
  const service = new CustomerApplicationService({ run, read: run } as unknown as CustomerUnitOfWork);

  return { customers, tx, service, run };
}

describe('CustomerApplicationService', () => {
  it.each([
    [{ isMember: false }, 'MEMBER_REQUIRED'],
    [{ verified: false }, 'VERIFIED_USER_REQUIRED'],
    [{ hasPlatformAccess: false }, 'SUBSCRIPTION_REQUIRED'],
    [{ billingNeedsReconciliation: true }, 'BILLING_RECONCILIATION_REQUIRED'],
  ] as const)('denies reads and writes before repository access for %j', async (patch, error) => {
    const f = fixture({ ...allowed, ...patch });
    const operation = vi.fn().mockResolvedValue('ok');

    await expect(f.service.read(actor, operation)).rejects.toThrow(error);
    await expect(f.service.run(actor, operation)).rejects.toThrow(error);
    expect(operation).not.toHaveBeenCalled();
  });

  it('does not reveal an unavailable scoped customer', async () => {
    const f = fixture();

    await expect(f.service.load(f.tx, 'unknown')).rejects.toThrow('CUSTOMER_NOT_FOUND');
    expect(f.customers.findById).toHaveBeenCalledWith('unknown');
  });

  it('checks optional email uniqueness, allowing the same customer on edit', async () => {
    const f = fixture();

    await f.service.assertEmailAvailable(f.tx, null);

    expect(f.customers.findByEmail).not.toHaveBeenCalled();

    f.customers.findByEmail.mockResolvedValue({
      id: 'existing',
      organizationId: 'org',
      name: 'Fixture',
      email: 'person@example.invalid',
      phone: null,
      defaultServiceAddress: null,
      notes: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(f.service.assertEmailAvailable(f.tx, 'person@example.invalid', 'existing')).resolves.toBeUndefined();
    await expect(f.service.assertEmailAvailable(f.tx, 'person@example.invalid', 'other')).rejects.toThrow('CUSTOMER_EMAIL_ALREADY_EXISTS');
  });
});
