import type { QuoteProps } from '../../domain/entities/quote.entity.js';
import type { QuoteShareProps } from '../../domain/entities/quoteShare.entity.js';

export interface PublicQuoteReadResult {
  organizationName: string;
  quote: QuoteProps;
  share: QuoteShareProps;
  generatedAt: Date;
}

export interface PublicQuoteDecisionResult {
  status: 'APPROVED' | 'DECLINED';
  decidedAt: Date;
  version: number;
}
