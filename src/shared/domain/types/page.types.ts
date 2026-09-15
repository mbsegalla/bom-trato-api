export interface PageParams {
  page: number;
  limit: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}
