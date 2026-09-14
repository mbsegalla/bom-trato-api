import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { ChangeWorkOrderParams, WorkOrderScheduleInput } from '../types/workOrder.types.js';

export class ScheduleWorkOrderUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: ChangeWorkOrderParams, input: WorkOrderScheduleInput) {
    const { scheduledStartAt, scheduledEndAt } = input;

    return this.processor.mutate(params, async (order, tx, now) => {
      await this.processor.assertAssignee(tx, order.snapshot().assignedToId);

      order.schedule(new Date(scheduledStartAt), new Date(scheduledEndAt), now);
    });
  }
}
