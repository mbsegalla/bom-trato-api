import { ensureReceivableFromWorkOrder } from '../../../receivables/application/services/receivableCreation.service.js';
import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { ChangeWorkOrderParams } from '../types/workOrder.types.js';

export class CompleteWorkOrderUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: ChangeWorkOrderParams) {
    return this.processor.mutate(params, async (order, tx, now) => {
      order.complete(now);

      const state = order.snapshot();

      const dueDays = await tx.findDefaultReceivableDueDays();

      const dueAt = new Date(now);

      dueAt.setUTCDate(dueAt.getUTCDate() + dueDays);

      await ensureReceivableFromWorkOrder({
        receivables: tx.receivables,
        organizationId: state.organizationId,
        userId: params.userId,
        source: state,
        dueAt,
        notes: null,
        now,
      });
    });
  }
}
