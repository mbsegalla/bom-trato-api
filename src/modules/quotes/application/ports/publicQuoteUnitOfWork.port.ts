import type { QuoteRepository } from '../../domain/repositories/quote.repository.js';
import type { QuoteShareRepository } from '../../domain/repositories/quoteShare.repository.js';

export interface PublicQuoteReadContext {
  readonly quotes: Pick<QuoteRepository, 'findById'>;
  readonly shares: Pick<QuoteShareRepository, 'findByHash'>;
  findOrganization(): Promise<{ name: string } | null>;
}

export interface PublicQuoteTransaction extends PublicQuoteReadContext {
  readonly quotes: Pick<QuoteRepository, 'findById' | 'save'>;
  readonly shares: Pick<QuoteShareRepository, 'findByHash' | 'saveDecision'>;
}

export abstract class PublicQuoteUnitOfWork {
  abstract read<T>(hash: string, operation: (context: PublicQuoteReadContext) => Promise<T>): Promise<T>;
  abstract run<T>(hash: string, operation: (tx: PublicQuoteTransaction) => Promise<T>): Promise<T>;
}
