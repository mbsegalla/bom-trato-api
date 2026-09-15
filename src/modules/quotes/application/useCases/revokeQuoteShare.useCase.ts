import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';
import type { QuoteByIdParams } from '../types/quote.types.js';

export class RevokeQuoteShareUseCase {
  constructor(private readonly processor: QuoteApplicationService) {}

  execute(params: QuoteByIdParams): Promise<void> {
    return this.processor.run(params, async (tx) => {
      await this.processor.load(tx, params.quoteId);

      await tx.shares.revokeForQuote(params.quoteId, new Date());
    });
  }
}
