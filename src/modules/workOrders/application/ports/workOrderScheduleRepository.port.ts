import type { Page } from '../../../../shared/types/page.types.js';
import type { WorkOrderScheduleItem, WorkOrderScheduleQuery } from '../types/workOrder.types.js';

export abstract class WorkOrderScheduleRepository {
  abstract list(params: WorkOrderScheduleQuery): Promise<Page<WorkOrderScheduleItem>>;
}
