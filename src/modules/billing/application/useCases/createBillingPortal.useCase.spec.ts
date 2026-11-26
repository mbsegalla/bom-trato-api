import { describe, expect, it, vi } from 'vitest';

import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingCustomerProps, BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';

import { CreateBillingPortalUseCase } from './createBillingPortal.useCase.js';

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

function fixture() {
  const assertOwner = vi.fn<BillingRepository['assertOwner']>().mockResolvedValue(undefined);
  const readCustomer = vi.fn<BillingRepository['customer']>().mockResolvedValue(customer);
  const createPortal = vi
    .fn<BillingGateway['createPortal']>()
    .mockResolvedValue('https://billing.example.invalid/session');
  const useCase = new CreateBillingPortalUseCase(
    { assertOwner, customer: readCustomer } as unknown as BillingRepository,
    { createPortal } as unknown as BillingGateway,
    'https://app.example.invalid',
  );

  return { useCase, assertOwner, readCustomer, createPortal };
}

describe('CreateBillingPortalUseCase', () => {
  it('rejects nonowners before reading the billing customer or contacting the gateway', async () => {
    const f = fixture();
    f.assertOwner.mockRejectedValueOnce(new BillingError('OWNER_REQUIRED'));

    await expect(f.useCase.execute(actor)).rejects.toThrow('OWNER_REQUIRED');

    expect(f.readCustomer).not.toHaveBeenCalled();
    expect(f.createPortal).not.toHaveBeenCalled();
  });

  it('rejects organizations without a remote customer', async () => {
    const f = fixture();
    f.readCustomer.mockResolvedValueOnce({ ...customer, stripeCustomerId: null });

    await expect(f.useCase.execute(actor)).rejects.toThrow('SUBSCRIPTION_NOT_FOUND');

    expect(f.createPortal).not.toHaveBeenCalled();
  });

  it('scopes the return URL to the authorized organization', async () => {
    const f = fixture();
    const organizationId = 'org with space&other=1';

    const result = await f.useCase.execute({ ...actor, organizationId });

    expect(result).toEqual({ url: 'https://billing.example.invalid/session' });
    expect(f.assertOwner).toHaveBeenCalledWith(organizationId, actor.userId);
    expect(f.readCustomer).toHaveBeenCalledWith(organizationId);
    const [remoteId, returnUrl] = f.createPortal.mock.calls[0];
    expect(remoteId).toBe(customer.stripeCustomerId);
    const url = new URL(returnUrl);
    expect(url.pathname).toBe('/billing');
    expect(url.searchParams.get('organizationId')).toBe(organizationId);
    expect(url.searchParams.has('other')).toBe(false);
  });
});
