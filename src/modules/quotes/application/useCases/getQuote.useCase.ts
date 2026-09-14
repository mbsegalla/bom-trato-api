import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { QuoteByIdParams } from '../types/quote.types.js';

export class GetQuoteUseCase {
  constructor(private readonly processor: QuoteApplicationService) {}

  execute(params: QuoteByIdParams) {
    return this.processor.read(params, async (context) => {
      const quote = await this.processor.load(context, params.quoteId);

      return quote.snapshot();
    });
  }
}
