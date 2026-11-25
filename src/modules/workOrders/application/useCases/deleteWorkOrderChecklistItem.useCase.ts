import { WorkOrderChecklistItem } from '../../domain/entities/workOrderChecklistItem.entity.js';
import { WorkOrderChecklistError } from '../../domain/errors/workOrderChecklist.error.js';
import type { WorkOrderChecklistApplicationService } from '../services/workOrderChecklistApplicationService.service.js';
import type { ChangeWorkOrderChecklistItemParams } from '../types/workOrderChecklist.types.js';

export class DeleteWorkOrderChecklistItemUseCase {
  constructor(private readonly processor: WorkOrderChecklistApplicationService) {}

  execute(params: ChangeWorkOrderChecklistItemParams): Promise<void> {
    return this.processor.run(
      params,
      async (tx) => {
        const state = await tx.checklist.findById(params.itemId);

        if (state === null) {
          throw new WorkOrderChecklistError('WORK_ORDER_CHECKLIST_ITEM_NOT_FOUND');
        }

        WorkOrderChecklistItem.restore(state).assertVersion(params.version);

        await tx.checklist.delete(params.itemId, params.version);
      },
      false,
    );
  }
}
