import type { Page, PageParams } from '../../../../shared/types/page.types.js';
import type { WorkOrder } from '../entities/workOrder.entity.js';
import type {
  WorkOrderPage,
  WorkOrderPageParams,
  WorkOrderProps,
  WorkOrderScheduleHistoryProps,
  WorkOrderScheduleSlot,
  WorkOrderStatusHistoryProps,
  WorkOrderSummary,
} from '../types/workOrder.types.js';

export abstract class WorkOrderRepository {
  abstract create(order: WorkOrder): Promise<void>;
  abstract findById(id: string): Promise<WorkOrderProps | null>;
  abstract findByQuoteId(quoteId: string): Promise<WorkOrderProps | null>;
  abstract list(params: WorkOrderPageParams): Promise<WorkOrderPage<WorkOrderSummary>>;
  abstract save(order: WorkOrder, expectedVersion: number): Promise<void>;
  abstract listStatusHistory(workOrderId: string): Promise<WorkOrderStatusHistoryProps[]>;
  abstract hasScheduleConflict(slot: WorkOrderScheduleSlot): Promise<boolean>;
  abstract listScheduleHistory(workOrderId: string, page: PageParams): Promise<Page<WorkOrderScheduleHistoryProps>>;
}
