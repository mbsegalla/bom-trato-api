export interface OrganizationPageParams {
  page: number;
  limit: number;
}

export interface OrganizationPage<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}
