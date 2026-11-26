import type { WorkOrderByIdParams } from '../types/workOrder.types.js';
import type {
  SaveWorkOrderRecurrenceInput,
  WorkOrderRecurrenceListInput,
  WorkOrderRecurrenceListView,
  WorkOrderRecurrenceView,
} from '../types/workOrderRecurrence.types.js';
import type { WorkOrderActorParams } from './workOrderUnitOfWork.port.js';

export abstract class WorkOrderRecurrenceRepository {
  abstract list(params: WorkOrderActorParams, input: WorkOrderRecurrenceListInput): Promise<WorkOrderRecurrenceListView>;
  abstract read(params: WorkOrderByIdParams): Promise<WorkOrderRecurrenceView>;
  abstract save(params: WorkOrderByIdParams, input: SaveWorkOrderRecurrenceInput): Promise<WorkOrderRecurrenceView>;
}
