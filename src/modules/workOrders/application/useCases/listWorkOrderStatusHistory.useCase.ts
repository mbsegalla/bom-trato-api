import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';

export class ListWorkOrderStatusHistoryUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: WorkOrderByIdParams) {
    return this.processor.read(params, (context) => context.workOrders.listStatusHistory(params.workOrderId));
  }
}
