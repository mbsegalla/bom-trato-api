import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { UpdateWorkOrderChecklistItemInput } from '../../domain/entities/workOrderChecklistItem.entity.js';
import { WorkOrderChecklistItem } from '../../domain/entities/workOrderChecklistItem.entity.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import { WorkOrderChecklistError } from '../../domain/errors/workOrderChecklist.error.js';
import { toWorkOrderChecklistItemView } from '../mappers/workOrderChecklist.mapper.js';
import type { WorkOrderChecklistApplicationService } from '../services/workOrderChecklistApplicationService.service.js';
import type {
  ChangeWorkOrderChecklistItemParams,
  WorkOrderChecklistItemView,
} from '../types/workOrderChecklist.types.js';

export class UpdateWorkOrderChecklistItemUseCase {
  constructor(private readonly processor: WorkOrderChecklistApplicationService) {}

  execute(
    params: ChangeWorkOrderChecklistItemParams,
    input: UpdateWorkOrderChecklistItemInput,
  ): Promise<WorkOrderChecklistItemView> {
    return this.processor.run(
      params,
      async (tx) => {
        const state = await tx.checklist.findById(params.itemId);

        if (state === null) {
          throw new WorkOrderChecklistError('WORK_ORDER_CHECKLIST_ITEM_NOT_FOUND');
        }

        const hidesOnly =
          input.visibleInPortal === false &&
          (input.title === undefined || WorkOrderChecklistItem.normalizeTitle(input.title) === state.title) &&
          (input.completed === undefined || input.completed === state.completed);

        if (!hidesOnly) {
          OrganizationAccessPolicy.assertCanOperate(tx.access, (code) => new WorkOrderError(code));
        }

        const item = WorkOrderChecklistItem.restore(state);

        item.update(params.version, input, params.userId, new Date());

        await tx.checklist.save(item, params.version);

        return toWorkOrderChecklistItemView(item.snapshot());
      },
      false,
    );
  }
}
