import type { Page, PageParams } from '../../../../shared/types/page.types.js';

export const catalogServiceStatuses = ['ACTIVE', 'ARCHIVED', 'ALL'] as const;

export interface CatalogServicePageParams extends PageParams {
  search?: string;
  status: (typeof catalogServiceStatuses)[number];
}

export type CatalogServicePage<T> = Page<T>;
