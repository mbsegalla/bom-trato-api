import type { Quote, QuoteProps } from '../entities/quote.entity.js';
import type { QuotePage, QuotePageParams, QuoteStatusHistoryProps, QuoteSummary } from '../types/quote.types.js';

export abstract class QuoteRepository {
  abstract create(quote: Quote): Promise<void>;
  abstract findById(id: string): Promise<QuoteProps | null>;
  abstract list(params: QuotePageParams): Promise<QuotePage<QuoteSummary>>;
  abstract save(quote: Quote, expectedVersion: number): Promise<void>;
  abstract listStatusHistory(quoteId: string): Promise<QuoteStatusHistoryProps[]>;
}
