import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { ChangeQuoteParams } from '../types/quote.types.js';

export class DeclineQuoteUseCase {
  constructor(private readonly processor: QuoteApplicationService) {}

  execute(params: ChangeQuoteParams) {
    return this.processor.mutate(params, (quote, _tx, now) => {
      quote.decline(now);
    });
  }
}
