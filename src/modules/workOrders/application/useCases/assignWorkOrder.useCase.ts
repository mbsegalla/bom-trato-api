import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { ChangeWorkOrderParams } from '../types/workOrder.types.js';

export class AssignWorkOrderUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: ChangeWorkOrderParams, assignedToId: string | null) {
    return this.processor.mutate(params, async (order, tx) => {
      if (assignedToId !== null) {
        await this.processor.assertAssignee(tx, assignedToId);
      }

      order.assign(assignedToId);
    });
  }
}
