import { describe, expect, it, vi } from 'vitest';

import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import { RefreshBillingUseCase } from './refreshBilling.useCase.js';
import type { SyncBillingUseCase } from './syncBilling.useCase.js';

const actor = { organizationId: 'org', userId: 'owner' };

describe('RefreshBillingUseCase', () => {
  it('requires ownership and requests reconciliation for the scoped organization', async () => {
    const assertOwner = vi.fn<BillingRepository['assertOwner']>().mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue(undefined);
    const useCase = new RefreshBillingUseCase(
      { assertOwner } as unknown as BillingRepository,
      { execute } as unknown as SyncBillingUseCase,
    );

    await useCase.execute(actor);

    expect(assertOwner).toHaveBeenCalledWith(actor.organizationId, actor.userId);
    expect(execute).toHaveBeenCalledWith({ organizationId: actor.organizationId, reconcile: true });

    assertOwner.mockRejectedValueOnce(new BillingError('OWNER_REQUIRED'));
    await expect(useCase.execute(actor)).rejects.toThrow('OWNER_REQUIRED');
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
