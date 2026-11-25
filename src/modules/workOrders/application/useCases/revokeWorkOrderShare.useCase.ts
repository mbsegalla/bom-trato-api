import type { WorkOrderShareApplicationService } from '../services/workOrderShareApplicationService.service.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';

export class RevokeWorkOrderShareUseCase {
  constructor(private readonly processor: WorkOrderShareApplicationService) {}

  execute(params: WorkOrderByIdParams): Promise<void> {
    return this.processor.runForVerifiedMember(params, async (tx, workOrder) => {
      await tx.shares.revokeForWorkOrder(workOrder.id, new Date());
    });
  }
}
