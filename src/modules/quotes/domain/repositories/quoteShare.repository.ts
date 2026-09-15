import type { QuoteShare, QuoteShareProps } from '../entities/quoteShare.entity.js';

export abstract class QuoteShareRepository {
  abstract findByHash(hash: string): Promise<QuoteShareProps | null>;
  abstract create(share: QuoteShare): Promise<void>;
  abstract saveDecision(share: QuoteShare): Promise<void>;
  abstract revokeForQuote(quoteId: string, now: Date): Promise<void>;
}
