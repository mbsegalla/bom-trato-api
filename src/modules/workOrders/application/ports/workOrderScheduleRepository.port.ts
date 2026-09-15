import type { Page } from '../../../../shared/domain/types/page.types.js';
import type { WorkOrderScheduleItem, WorkOrderScheduleQuery } from '../types/workOrderSchedule.types.js';

export abstract class WorkOrderScheduleRepository {
  abstract list(params: WorkOrderScheduleQuery): Promise<Page<WorkOrderScheduleItem>>;
}
