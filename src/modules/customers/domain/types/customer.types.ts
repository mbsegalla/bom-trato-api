import type { Page, PageParams } from '../../../../shared/types/page.types.js';

export const customerStatuses = ['ACTIVE', 'ARCHIVED', 'ALL'] as const;

export interface CustomerPageParams extends PageParams {
  search?: string;
  status: (typeof customerStatuses)[number];
}

export interface CustomerOverviewSummary {
  quoteCount: number;
  workOrderCount: number;
  completedWorkOrderCount: number;
  currency: 'brl';
  pendingAmountInCents: number;
  overdueAmountInCents: number;
  receivedAmountInCents: number;
}

export type CustomerPage<T> = Page<T>;
