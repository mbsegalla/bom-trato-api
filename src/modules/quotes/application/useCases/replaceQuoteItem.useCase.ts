import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { AddQuoteItemInput, ChangeQuoteParams } from '../types/quote.types.js';

export class ReplaceQuoteItemUseCase {
  constructor(private readonly processor: QuoteApplicationService) {}

  execute(params: ChangeQuoteParams & { itemId: string }, input: AddQuoteItemInput) {
    return this.processor.mutate(params, async (quote, tx) => {
      const item = await this.processor.item(tx, input, params.itemId);

      quote.replaceItem(params.itemId, item);
    });
  }
}
