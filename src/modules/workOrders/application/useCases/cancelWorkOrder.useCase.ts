import { ReceivableStatus } from '../../../../generated/prisma/enums.js';
import { Receivable } from '../../../receivables/domain/entities/receivable.entity.js';
import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import type { ChangeWorkOrderParams } from '../types/workOrder.types.js';

export class CancelWorkOrderUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: ChangeWorkOrderParams, reason: string) {
    return this.processor.mutate(params, async (order, tx, now) => {
      order.cancel(reason, now);

      const receivables = await tx.receivables.listByWorkOrderId(order.snapshot().id);

      for (const state of receivables) {
        if (state.status === ReceivableStatus.CANCELED || state.receivedInCents > 0) {
          continue;
        }

        const receivable = Receivable.restore(state);

        receivable.cancel(params.userId, reason, now);
        receivable.recordChange(params.userId, now);

        await tx.receivables.save(receivable, state.version);
      }
    });
  }
}
