import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { ChangeQuoteParams } from '../types/quote.types.js';

export class RemoveQuoteItemUseCase {
  constructor(private readonly processor: QuoteApplicationService) {}

  execute(params: ChangeQuoteParams & { itemId: string }) {
    return this.processor.mutate(params, (quote) => {
      quote.removeItem(params.itemId);
    });
  }
}
