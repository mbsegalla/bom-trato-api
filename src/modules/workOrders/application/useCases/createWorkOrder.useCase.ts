import { ensureInitialReceivableFromQuote } from '../../../receivables/application/services/receivableAutomation.service.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import type { WorkOrderActorParams } from '../ports/workOrderUnitOfWork.port.js';
import type { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import { ensureWorkOrderFromApprovedQuote } from '../services/workOrderCreation.service.js';

export class CreateWorkOrderUseCase {
  constructor(private readonly processor: WorkOrderApplicationService) {}

  execute(params: WorkOrderActorParams, quoteId: string) {
    return this.processor.run(params, async (tx) => {
      const quote = await tx.findQuote(quoteId);

      if (quote === null) {
        throw new WorkOrderError('QUOTE_NOT_FOUND');
      }

      const existing = await tx.workOrders.findByQuoteId(quoteId);

      if (existing !== null) {
        await ensureInitialReceivableFromQuote({
          receivables: tx.receivables,
          organizationId: params.organizationId,
          userId: params.userId,
          source: existing,
          quote,
          now: new Date(),
        });

        return existing;
      }

      const [assignedToId, serviceAddress] = await Promise.all([
        tx.findSingleAssignableMember(),
        tx.findCustomerDefaultServiceAddress(quote.customerId),
      ]);

      const now = new Date();

      const workOrder = await ensureWorkOrderFromApprovedQuote({
        workOrders: tx.workOrders,
        quote,
        createdById: params.userId,
        assignedToId,
        serviceAddress,
        now,
      });

      await ensureInitialReceivableFromQuote({
        receivables: tx.receivables,
        organizationId: params.organizationId,
        userId: params.userId,
        source: workOrder,
        quote,
        now,
      });

      return workOrder;
    });
  }
}
