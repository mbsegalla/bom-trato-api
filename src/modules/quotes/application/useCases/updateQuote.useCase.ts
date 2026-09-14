import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { ChangeQuoteParams, UpdateQuoteInput } from '../types/quote.types.js';

export class UpdateQuoteUseCase {
  constructor(private readonly processor: QuoteApplicationService) {}

  execute(params: ChangeQuoteParams, input: UpdateQuoteInput) {
    return this.processor.mutate(params, (quote, _tx, now) => {
      quote.update(this.processor.details(input), now);
    });
  }
}
