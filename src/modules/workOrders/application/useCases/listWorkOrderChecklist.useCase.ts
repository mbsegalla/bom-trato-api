import { toWorkOrderChecklistView } from '../mappers/workOrderChecklist.mapper.js';
import type { WorkOrderChecklistApplicationService } from '../services/workOrderChecklistApplicationService.service.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';
import type { WorkOrderChecklistView } from '../types/workOrderChecklist.types.js';

export class ListWorkOrderChecklistUseCase {
  constructor(private readonly processor: WorkOrderChecklistApplicationService) {}

  execute(params: WorkOrderByIdParams): Promise<WorkOrderChecklistView> {
    return this.processor.read(params, async (context) => toWorkOrderChecklistView(await context.checklist.list()));
  }
}
