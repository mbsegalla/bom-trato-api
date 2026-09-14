import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { QuoteByIdParams } from '../types/quote.types.js';

export class ListQuoteStatusHistoryUseCase {
  constructor(private readonly processor: QuoteApplicationService) {}

  execute(params: QuoteByIdParams) {
    return this.processor.read(params, (context) => context.quotes.listStatusHistory(params.quoteId));
  }
}
