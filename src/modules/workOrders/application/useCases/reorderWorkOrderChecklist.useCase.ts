import { WorkOrderChecklistItem } from '../../domain/entities/workOrderChecklistItem.entity.js';
import { WorkOrderChecklistError } from '../../domain/errors/workOrderChecklist.error.js';
import { toWorkOrderChecklistView } from '../mappers/workOrderChecklist.mapper.js';
import type { WorkOrderChecklistApplicationService } from '../services/workOrderChecklistApplicationService.service.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';
import type { ReorderWorkOrderChecklistInput, WorkOrderChecklistView } from '../types/workOrderChecklist.types.js';

export class ReorderWorkOrderChecklistUseCase {
  constructor(private readonly processor: WorkOrderChecklistApplicationService) {}

  execute(params: WorkOrderByIdParams, input: ReorderWorkOrderChecklistInput): Promise<WorkOrderChecklistView> {
    return this.processor.run(params, async (tx) => {
      const current = await tx.checklist.list();
      const byId = new Map(current.map((item) => [item.id, item]));

      if (
        input.items.length !== current.length ||
        new Set(input.items.map((item) => item.id)).size !== current.length ||
        input.items.some((item) => !byId.has(item.id))
      ) {
        throw new WorkOrderChecklistError('WORK_ORDER_CHECKLIST_VERSION_CONFLICT');
      }

      const now = new Date();
      const reordered = input.items.map((requested, position) => {
        const state = byId.get(requested.id)!;
        const item = WorkOrderChecklistItem.restore(state);

        item.move(requested.version, position, params.userId, now);

        return { item, expectedVersion: requested.version, changed: state.position !== position };
      });

      // Validate the entire snapshot before saving any item. The transaction also
      // rolls back every position change if a repository write fails.
      for (const { item, expectedVersion, changed } of reordered) {
        if (changed) {
          await tx.checklist.save(item, expectedVersion);
        }
      }

      return toWorkOrderChecklistView(reordered.map(({ item }) => item.snapshot()));
    });
  }
}
