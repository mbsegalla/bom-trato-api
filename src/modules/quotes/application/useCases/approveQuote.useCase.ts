import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { ChangeQuoteParams } from '../types/quote.types.js';

export class ApproveQuoteUseCase {
  constructor(private readonly processor: QuoteApplicationService) {}

  execute(params: ChangeQuoteParams) {
    return this.processor.mutate(params, (quote, _tx, now) => {
      quote.approve(now);
    });
  }
}
