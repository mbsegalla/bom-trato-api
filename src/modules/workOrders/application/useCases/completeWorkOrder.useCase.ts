import { ensureFinalReceivableFromQuote } from '../../../receivables/application/services/receivableAutomation.service.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { ChangeWorkOrderParams } from '../types/workOrder.types.js';

export class CompleteWorkOrderUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: ChangeWorkOrderParams) {
    return this.processor.mutate(params, async (order, tx, now) => {
      order.complete(now);

      const state = order.snapshot();

      const quote = await tx.findQuote(state.quoteId);

      if (quote === null) {
        throw new WorkOrderError('QUOTE_NOT_FOUND');
      }

      const dueDays = await tx.findDefaultReceivableDueDays();

      const dueAt = new Date(now);

      dueAt.setUTCDate(dueAt.getUTCDate() + dueDays);

      await ensureFinalReceivableFromQuote({
        receivables: tx.receivables,
        organizationId: state.organizationId,
        userId: params.userId,
        source: state,
        quote,
        dueAt,
        now,
      });
    });
  }
}
