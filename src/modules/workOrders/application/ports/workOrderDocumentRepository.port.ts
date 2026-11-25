import type { WorkOrderByIdParams } from '../types/workOrder.types.js';
import type {
  UpdateWorkOrderWarrantyInput,
  WorkOrderDocumentContext,
  WorkOrderWarrantyResult,
} from '../types/workOrderDocument.types.js';

export abstract class WorkOrderDocumentRepository {
  abstract read(params: WorkOrderByIdParams): Promise<WorkOrderDocumentContext>;
  abstract saveWarranty(
    params: WorkOrderByIdParams,
    input: UpdateWorkOrderWarrantyInput,
  ): Promise<WorkOrderWarrantyResult>;
}
