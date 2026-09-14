import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import type { WorkOrderActorParams } from '../ports/workOrderUnitOfWork.port.js';
import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { WorkOrderPageInput } from '../types/workOrder.types.js';

export class ListWorkOrdersUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: WorkOrderActorParams, input: WorkOrderPageInput) {
    const scheduledFrom = input.scheduledFrom === undefined ? undefined : new Date(input.scheduledFrom);
    const scheduledTo = input.scheduledTo === undefined ? undefined : new Date(input.scheduledTo);

    if (
      (scheduledFrom !== undefined && !Number.isFinite(scheduledFrom.getTime())) ||
      (scheduledTo !== undefined && !Number.isFinite(scheduledTo.getTime())) ||
      (scheduledFrom !== undefined && scheduledTo !== undefined && scheduledFrom > scheduledTo)
    ) {
      throw new WorkOrderError('INVALID_WORK_ORDER_SCHEDULE');
    }

    return this.processor.read(params, (context) =>
      context.workOrders.list({
        ...input,
        scheduledFrom,
        scheduledTo,
      }),
    );
  }
}
