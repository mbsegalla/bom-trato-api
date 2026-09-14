import type { WorkOrderDetails } from '../../domain/entities/workOrder.entity.js';
import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { ChangeWorkOrderParams } from '../types/workOrder.types.js';

export class UpdateWorkOrderUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: ChangeWorkOrderParams, details: WorkOrderDetails) {
    return this.processor.mutate(params, (order) => {
      order.update(details);
    });
  }
}
