import type { WorkOrderRecurrenceSettings } from '../../domain/policies/workOrderRecurrence.policy.js';
import type { WorkOrderRecurrenceRepository } from '../ports/workOrderRecurrenceRepository.port.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';

export class ManageWorkOrderRecurrenceUseCase {
  constructor(private readonly repository: WorkOrderRecurrenceRepository) {}

  read(params: WorkOrderByIdParams) {
    return this.repository.read(params);
  }

  save(params: WorkOrderByIdParams, input: WorkOrderRecurrenceSettings) {
    return this.repository.save(params, input);
  }
}
