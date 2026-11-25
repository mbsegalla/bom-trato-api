import type { WorkOrderRecurrenceSettings } from '../../domain/policies/workOrderRecurrence.policy.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';
import type { WorkOrderRecurrenceView } from '../types/workOrderRecurrence.types.js';

export abstract class WorkOrderRecurrenceRepository {
  abstract read(params: WorkOrderByIdParams): Promise<WorkOrderRecurrenceView>;
  abstract save(params: WorkOrderByIdParams, input: WorkOrderRecurrenceSettings): Promise<WorkOrderRecurrenceView>;
}
