import { PlanChange } from '../../domain/entities/planChange.entity.js';
import type { PlanChangeRepository } from '../../domain/repositories/planChange.repository.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import type { PlanChangeProcessor } from '../services/planChangeProcessor.service.js';
export class ReconcilePlanChangeUseCase {
  constructor(
    private readonly planChangeRepository: PlanChangeRepository,
    private readonly billingLock: BillingLock,
    private readonly processor: PlanChangeProcessor,
  ) {}

  async execute(organizationId: string): Promise<void> {
    await this.billingLock.run(`organization:${organizationId}`, async () => {
      const stored = await this.planChangeRepository.active(organizationId);

      if (stored !== null) {
        await this.processor.refresh(PlanChange.restore(stored));
      }
    });
  }
}
