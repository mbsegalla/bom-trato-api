import type { ReceivableStatus } from '../../../../generated/prisma/enums.js';

export interface ReceivablePagination {
  page: number;
  limit: number;
}

export interface ReceivablePageParams extends ReceivablePagination {
  status?: ReceivableStatus;
  customerId?: string;
  workOrderId?: string;
  overdue?: boolean;
  dueFrom?: Date;
  dueTo?: Date;
  now: Date;
}

export interface ReceivablePage<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}
