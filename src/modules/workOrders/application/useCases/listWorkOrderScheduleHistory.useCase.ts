import type { PageParams } from '../../../../shared/types/page.types.js';
import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';

export class ListWorkOrderScheduleHistoryUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: WorkOrderByIdParams, page: PageParams) {
    return this.processor.read(params, (context) => context.workOrders.listScheduleHistory(params.workOrderId, page));
  }
}
