import type { BillingRepository } from '../../domain/repositories/billing.repository.js';

import type { SyncBillingUseCase } from './syncBilling.useCase.js';

interface RefreshBillingParams {
  organizationId: string;
  userId: string;
}

export class RefreshBillingUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly syncBillingUseCase: SyncBillingUseCase,
  ) {}

  async execute(params: RefreshBillingParams): Promise<void> {
    const { organizationId, userId } = params;

    await this.billingRepository.assertOwner(organizationId, userId);

    await this.syncBillingUseCase.execute({
      organizationId,
      reconcile: true,
    });
  }
}
