import type { QuoteStatus } from '../../../../generated/prisma/enums.js';
import type { Page, PageParams } from '../../../../shared/types/page.types.js';
import type { QuoteProps } from '../entities/quote.entity.js';

export interface QuotePageParams extends PageParams {
  status?: QuoteStatus;
  customerId?: string;
}

export type QuotePage<T> = Page<T>;

export interface QuoteStatusHistoryProps {
  id: string;
  quoteId: string;
  fromStatus: QuoteStatus | null;
  toStatus: QuoteStatus;
  actorId: string | null;
  version: number;
  createdAt: Date;
}

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
