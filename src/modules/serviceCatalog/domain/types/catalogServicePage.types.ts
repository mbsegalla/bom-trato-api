export const catalogServiceStatuses = ['ACTIVE', 'ARCHIVED', 'ALL'] as const;

export interface CatalogServicePageParams {
  page: number;
  limit: number;
  search?: string;
  status: (typeof catalogServiceStatuses)[number];
}

export interface CatalogServicePage<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}
