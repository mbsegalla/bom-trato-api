import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { AddQuoteItemInput, ChangeQuoteParams } from '../types/quote.types.js';

export class AddQuoteItemUseCase {
  constructor(private readonly processor: QuoteApplicationService) {}

  execute(params: ChangeQuoteParams, input: AddQuoteItemInput) {
    return this.processor.mutate(params, async (quote, tx) => {
      const item = await this.processor.item(tx, input);

      quote.addItem(item);
    });
  }
}
