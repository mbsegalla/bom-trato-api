import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import { assertRepeatableWorkOrder, createRepeatedWorkOrderQuote } from '../services/repeatedWorkOrderQuote.service.js';
import type { QuoteByIdParams, QuoteDetailsResult } from '../types/quote.types.js';

export class RepeatWorkOrderQuoteUseCase {
  constructor(private readonly processor: QuoteApplicationService) {}

  execute(params: QuoteByIdParams): Promise<QuoteDetailsResult> {
    return this.processor.run(params, async (tx) => {
      const source = (await this.processor.load(tx, params.quoteId)).snapshot();
      const workOrder = await tx.workOrders.findByQuoteId(source.id);

      assertRepeatableWorkOrder(source, workOrder, params.organizationId);

      const customer = await this.processor.customer(tx, workOrder.customerId);
      const quote = createRepeatedWorkOrderQuote(params, source, workOrder, customer, new Date());

      await tx.quotes.create(quote);

      return { ...quote.snapshot(), changeRequest: null };
    });
  }
}
