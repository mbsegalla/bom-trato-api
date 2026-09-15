import { WorkOrderSchedulePeriod } from '../../domain/valueObjects/workOrderSchedulePeriod.valueObject.js';
import type { WorkOrderActorParams } from '../ports/workOrderUnitOfWork.port.js';
import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { WorkOrderScheduleInput, WorkOrderScheduleView } from '../types/workOrderSchedule.types.js';

export class ListWorkOrderScheduleUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: WorkOrderActorParams, input: WorkOrderScheduleInput): Promise<WorkOrderScheduleView> {
    const { from, to } = input;

    return this.processor.read(params, async (context) => {
      const period = WorkOrderSchedulePeriod.create(new Date(from), new Date(to)).snapshot();

      const now = new Date();

      const page = await context.schedule.list({
        ...input,
        ...period,
        now,
      });

      return {
        ...page,
        ...period,
        generatedAt: now,
      };
    });
  }
}
