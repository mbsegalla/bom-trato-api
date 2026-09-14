import type { QuoteItemDetails } from '../../domain/entities/quoteItem.entity.js';
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
