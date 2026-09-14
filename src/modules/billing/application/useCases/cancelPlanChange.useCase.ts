import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import type { PlanChangeGateway } from '../ports/planChangeGateway.port.js';
import type { PlanChangeProcessor } from '../services/planChangeProcessor.service.js';
import type { PlanChangeActionParams } from '../types/changePlan.types.js';

export class CancelPlanChangeUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly planChangeRepository: PlanChangeRepository,
    private readonly planChangeGateway: PlanChangeGateway,
    private readonly billingLock: BillingLock,
    private readonly processor: PlanChangeProcessor,
  ) {}

  async execute(params: PlanChangeActionParams) {
    const { organizationId, userId } = params;

    await this.billingRepository.assertOwner(organizationId, userId);

    return this.billingLock.run(`organization:${organizationId}`, async () => {
      const change = await this.processor.ownedChange(params);

      if (change.isTerminal()) {
        return change.toPublic();
      }

      change.assertCanRequestCancellation(new Date());

      if (change.isQuoted()) {
        change.markCanceled();

        await this.planChangeRepository.save(change);

        return change.toPublic();
      }

      await this.planChangeGateway.cancel(change.snapshot());

      return this.processor.refresh(change);
    });
  }
}
