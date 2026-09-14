import { randomUUID } from 'node:crypto';

import { WorkOrder } from '../../domain/entities/workOrder.entity.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import type { WorkOrderActorParams } from '../ports/workOrderUnitOfWork.port.js';
import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';

export class CreateWorkOrderUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: WorkOrderActorParams, quoteId: string) {
    return this.processor.run(params, async (tx) => {
      const existing = await tx.workOrders.findByQuoteId(quoteId);

      if (existing !== null) {
        return existing;
      }

      const quote = await tx.findQuote(quoteId);

      if (quote === null) {
        throw new WorkOrderError('QUOTE_NOT_FOUND');
      }

      const order = WorkOrder.create(
        {
          ...params,
          id: randomUUID(),
          quote,
          itemIds: quote.items.map(() => randomUUID()),
        },
        new Date(),
      );

      await tx.workOrders.create(order);

      return order.snapshot();
    });
  }
}
