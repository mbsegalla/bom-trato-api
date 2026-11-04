import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { QuoteByIdParams, QuoteDetailsResult } from '../types/quote.types.js';

export class GetQuoteUseCase {
  constructor(private readonly processor: QuoteApplicationService) {}

  execute(params: QuoteByIdParams): Promise<QuoteDetailsResult> {
    return this.processor.read(params, async (context) => {
      const quote = await this.processor.load(context, params.quoteId);

      const state = quote.snapshot();

      return {
        ...state,
        changeRequest: await context.shares.findLatestChangeRequest(state.id),
      };
    });
  }
}
