import type { QuoteProps } from '../../domain/entities/quote.entity.js';
import type { QuoteItemDetails } from '../../domain/entities/quoteItem.entity.js';
import type { QuoteShareProps } from '../../domain/entities/quoteShare.entity.js';
import type { QuoteActorParams } from '../ports/quoteUnitOfWork.port.js';

export interface QuoteByIdParams extends QuoteActorParams {
  quoteId: string;
}

export interface ChangeQuoteParams extends QuoteByIdParams {
  version: number;
}

export interface QuoteDetailsInput {
  title: string;
  notes?: string | null;
  validUntil?: string | null;
}

export interface UpdateQuoteInput extends Partial<QuoteDetailsInput> {
  discountInCents?: number;
}

export interface AddQuoteItemInput {
  catalogServiceId?: string;
  quantity: string;
  custom?: Omit<QuoteItemDetails, 'quantity'>;
}

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

export interface QuotePdfData {
  organizationName: string;
  generatedAt: Date;
  quote: Pick<
    QuoteProps,
    | 'id'
    | 'version'
    | 'title'
    | 'status'
    | 'customerName'
    | 'customerEmail'
    | 'customerPhone'
    | 'currency'
    | 'subtotalInCents'
    | 'discountInCents'
    | 'totalInCents'
    | 'createdAt'
    | 'validUntil'
    | 'notes'
    | 'items'
  >;
}

export interface QuotePdfFile {
  content: Uint8Array;
  filename: string;
}
