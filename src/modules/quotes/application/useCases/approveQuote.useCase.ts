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

      await ensureWorkOrderFromApprovedQuote({
        workOrders: tx.workOrders,
        quote: state,
        createdById: params.userId,
        assignedToId,
        serviceAddress,
        now,
      });
    });
  }
}
