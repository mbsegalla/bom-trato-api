import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import type { PlanChangeProcessor } from '../services/planChangeProcessor.service.js';
import type { PlanChangeActionParams } from '../types/billing.types.js';

export class SyncPlanChangeUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly billingLock: BillingLock,
    private readonly processor: PlanChangeProcessor,
  ) {}

  async execute(params: PlanChangeActionParams) {
    const { organizationId, userId } = params;

    await this.billingRepository.assertOwner(organizationId, userId);

    return this.billingLock.run(`organization:${organizationId}`, async () =>
      this.processor.refresh(await this.processor.ownedChange(params)),
    );
  }
}
