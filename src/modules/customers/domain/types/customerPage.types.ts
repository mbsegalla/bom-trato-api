export const customerStatuses = ['ACTIVE', 'ARCHIVED', 'ALL'] as const;

export interface CustomerPageParams {
  page: number;
  limit: number;
  search?: string;
  status: (typeof customerStatuses)[number];
}

export interface CustomerPage<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}
