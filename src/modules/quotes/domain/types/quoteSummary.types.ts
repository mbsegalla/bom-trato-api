import type { QuoteProps } from '../entities/quote.entity.js';

export type QuoteSummary = Pick<
  QuoteProps,
  | 'id'
  | 'organizationId'
  | 'customerId'
  | 'customerName'
  | 'title'
  | 'status'
  | 'currency'
  | 'totalInCents'
  | 'version'
  | 'validUntil'
  | 'createdAt'
  | 'updatedAt'
>;
