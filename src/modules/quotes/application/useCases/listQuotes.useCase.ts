import type { QuotePageParams } from '../../domain/types/quote.types.js';
import type { QuoteActorParams } from '../ports/quoteUnitOfWork.port.js';
import type { QuoteApplicationService } from '../services/quoteApplicationService.service.js';

export class ListQuotesUseCase {
  constructor(private readonly processor: QuoteApplicationService) {}

  execute(params: QuoteActorParams, page: QuotePageParams) {
    return this.processor.read(params, (context) => context.quotes.list(page));
  }
}
