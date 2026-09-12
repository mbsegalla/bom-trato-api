import type { PlanChangeGateway } from '../ports/planChangeGateway.port.js';
import type { PlanChangeProcessor } from '../services/planChangeProcessor.service.js';
import type { PlanChangeActionParams } from '../types/changePlan.types.js';

export class GetPlanChangeUseCase {
  constructor(
    private readonly planChangeGateway: PlanChangeGateway,
    private readonly processor: PlanChangeProcessor,
  ) {}

  async execute(params: PlanChangeActionParams) {
    const change = await this.processor.ownedChange(params);
    const state = change.snapshot();

    if (state.status !== 'PENDING_PAYMENT') {
      return change.toPublic();
    }

    const remote = await this.planChangeGateway.inspect(state);

    return change.toPublic(remote?.status === 'PENDING_PAYMENT' ? remote.clientSecret : null);
  }
}
