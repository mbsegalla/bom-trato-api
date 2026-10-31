import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import type { WorkOrderActorParams } from '../ports/workOrderUnitOfWork.port.js';
import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import { ensureWorkOrderFromApprovedQuote } from '../services/workOrderCreation.service.js';

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

      const [assignedToId, serviceAddress] = await Promise.all([
        tx.findSingleAssignableMember(),
        tx.findCustomerDefaultServiceAddress(quote.customerId),
      ]);

      return ensureWorkOrderFromApprovedQuote({
        workOrders: tx.workOrders,
        quote,
        createdById: params.userId,
        assignedToId,
        serviceAddress,
        now: new Date(),
      });
    });
  }
}
