import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { ChangeQuoteParams } from '../types/quote.types.js';

export class SendQuoteUseCase {
  constructor(private readonly processor: QuoteApplicationService) {}

  execute(params: ChangeQuoteParams) {
    return this.processor.mutate(params, async (quote, tx, now) => {
      await this.processor.customer(tx, quote.snapshot().customerId);

      quote.markSent(now);
    });
  }
}
