import type { ReceivableStatus } from '../../../../generated/prisma/enums.js';
import type { Page, PageParams } from '../../../../shared/domain/types/page.types.js';

export type ReceivablePagination = PageParams;

export interface ReceivablePageParams extends ReceivablePagination {
  status?: ReceivableStatus;
  customerId?: string;
  workOrderId?: string;
  overdue?: boolean;
  dueFrom?: Date;
  dueTo?: Date;
  now: Date;
}

export type ReceivablePage<T> = Page<T>;
