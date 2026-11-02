import { ensureInitialReceivableFromQuote } from '../../../receivables/application/services/receivableAutomation.service.js';
import { ensureWorkOrderFromApprovedQuote } from '../../../workOrders/application/services/workOrderCreation.service.js';
import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { ChangeQuoteParams } from '../types/quote.types.js';

export class ApproveQuoteUseCase {
  constructor(private readonly processor: QuoteApplicationService) {}

  execute(params: ChangeQuoteParams) {
    return this.processor.mutate(params, async (quote, tx, now) => {
      quote.approve(now);

      const state = quote.snapshot();

      const [assignedToId, serviceAddress] = await Promise.all([
        tx.findSingleAssignableMember(),
        tx.findCustomerDefaultServiceAddress(state.customerId),
      ]);

      const workOrder = await ensureWorkOrderFromApprovedQuote({
        workOrders: tx.workOrders,
        quote: state,
        createdById: params.userId,
        assignedToId,
        serviceAddress,
        now,
      });

      await ensureInitialReceivableFromQuote({
        receivables: tx.receivables,
        organizationId: state.organizationId,
        userId: params.userId,
        source: workOrder,
        quote: state,
        now,
      });
    });
  }
}
