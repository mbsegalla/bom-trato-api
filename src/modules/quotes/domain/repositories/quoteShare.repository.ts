import type { QuoteShare, QuoteShareProps } from '../entities/quoteShare.entity.js';

export interface QuoteChangeRequest {
  quoteVersion: number;
  message: string;
  requestedAt: Date;
}

export abstract class QuoteShareRepository {
  abstract findByHash(hash: string): Promise<QuoteShareProps | null>;
  abstract findLatestChangeRequest(quoteId: string): Promise<QuoteChangeRequest | null>;
  abstract create(share: QuoteShare): Promise<void>;
  abstract saveDecision(share: QuoteShare): Promise<void>;
  abstract saveChangeRequest(share: QuoteShare): Promise<void>;
  abstract revokeForQuote(quoteId: string, now: Date): Promise<void>;
}
