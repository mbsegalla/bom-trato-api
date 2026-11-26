import { describe, expect, it, vi } from 'vitest';

import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';

import { ListBillingInvoicesUseCase } from './listBillingInvoices.useCase.js';

const params = { organizationId: 'org', userId: 'owner', cursor: 'cursor', limit: 12 };

describe('ListBillingInvoicesUseCase', () => {
  it('preserves organization scope and pagination without forwarding the actor to persistence', async () => {
    const assertOwner = vi.fn<BillingRepository['assertOwner']>().mockResolvedValue(undefined);
    const page = { items: [], nextCursor: 'next' };
    const invoices = vi.fn<BillingRepository['invoices']>().mockResolvedValue(page);
    const useCase = new ListBillingInvoicesUseCase({ assertOwner, invoices } as unknown as BillingRepository);

    expect(await useCase.execute(params)).toEqual(page);
    expect(assertOwner).toHaveBeenCalledWith(params.organizationId, params.userId);
    expect(invoices).toHaveBeenCalledWith({ organizationId: params.organizationId, cursor: params.cursor, limit: 12 });
  });

  it('stops before invoice lookup for an unauthorized actor', async () => {
    const assertOwner = vi.fn<BillingRepository['assertOwner']>().mockRejectedValue(new BillingError('OWNER_REQUIRED'));
    const invoices = vi.fn<BillingRepository['invoices']>();
    const useCase = new ListBillingInvoicesUseCase({ assertOwner, invoices } as unknown as BillingRepository);

    await expect(useCase.execute(params)).rejects.toThrow('OWNER_REQUIRED');

    expect(invoices).not.toHaveBeenCalled();
  });
});
