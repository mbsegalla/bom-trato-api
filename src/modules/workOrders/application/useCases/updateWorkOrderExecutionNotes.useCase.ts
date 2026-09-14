import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { ChangeWorkOrderParams } from '../types/workOrder.types.js';

export class UpdateWorkOrderExecutionNotesUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: ChangeWorkOrderParams, notes: string | null) {
    return this.processor.mutate(params, (order) => {
      order.updateExecutionNotes(notes);
    });
  }
}
