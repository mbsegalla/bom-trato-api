import type { QuoteStatus } from '../../../../generated/prisma/enums.js';

export interface QuotePageParams {
  page: number;
  limit: number;
  status?: QuoteStatus;
  customerId?: string;
}

export interface QuotePage<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}
