import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { ChangeWorkOrderParams } from '../types/workOrder.types.js';

export class CompleteWorkOrderUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: ChangeWorkOrderParams) {
    return this.processor.mutate(params, (order, _tx, now) => {
      order.complete(now);
    });
  }
}
