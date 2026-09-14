import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { ChangeWorkOrderParams } from '../types/workOrder.types.js';

export class CancelWorkOrderUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: ChangeWorkOrderParams, reason: string) {
    return this.processor.mutate(params, (order, _tx, now) => {
      order.cancel(reason, now);
    });
  }
}
