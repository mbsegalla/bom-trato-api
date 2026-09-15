import type { QuoteProps } from '../../domain/entities/quote.entity.js';

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
