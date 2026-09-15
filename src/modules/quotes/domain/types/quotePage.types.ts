import type { QuoteStatus } from '../../../../generated/prisma/enums.js';
import type { Page, PageParams } from '../../../../shared/domain/types/page.types.js';

export interface QuotePageParams extends PageParams {
  status?: QuoteStatus;
  customerId?: string;
}

export type QuotePage<T> = Page<T>;
