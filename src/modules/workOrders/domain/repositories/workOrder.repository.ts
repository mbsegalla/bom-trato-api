import type { WorkOrder } from '../entities/workOrder.entity.js';
import type {
  WorkOrderPage,
  WorkOrderPageParams,
  WorkOrderProps,
  WorkOrderStatusHistoryProps,
} from '../types/workOrder.types.js';
import type { WorkOrderSummary } from '../types/workOrderSummary.types.js';

export abstract class WorkOrderRepository {
  abstract create(order: WorkOrder): Promise<void>;
  abstract findById(id: string): Promise<WorkOrderProps | null>;
  abstract findByQuoteId(quoteId: string): Promise<WorkOrderProps | null>;
  abstract list(params: WorkOrderPageParams): Promise<WorkOrderPage<WorkOrderSummary>>;
  abstract save(order: WorkOrder, expectedVersion: number): Promise<void>;
  abstract listStatusHistory(workOrderId: string): Promise<WorkOrderStatusHistoryProps[]>;
}
