import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { ChangeWorkOrderParams } from '../types/workOrder.types.js';

export class StartWorkOrderUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: ChangeWorkOrderParams) {
    return this.processor.mutate(params, async (order, tx, now) => {
      await this.processor.assertAssignee(tx, order.snapshot().assignedToId);
      order.start(now);
    });
  }
}
