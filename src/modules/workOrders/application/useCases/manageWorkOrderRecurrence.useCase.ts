import type { WorkOrderRecurrenceSettings } from '../../domain/policies/workOrderRecurrence.policy.js';
import type { WorkOrderRecurrenceRepository } from '../ports/workOrderRecurrenceRepository.port.js';
import type { WorkOrderActorParams } from '../ports/workOrderUnitOfWork.port.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';
import type { WorkOrderRecurrenceListInput } from '../types/workOrderRecurrence.types.js';

export class ManageWorkOrderRecurrenceUseCase {
  constructor(private readonly repository: WorkOrderRecurrenceRepository) {}

  list(params: WorkOrderActorParams, input: WorkOrderRecurrenceListInput) {
    return this.repository.list(params, input);
  }

  read(params: WorkOrderByIdParams) {
    return this.repository.read(params);
  }

  save(params: WorkOrderByIdParams, input: WorkOrderRecurrenceSettings) {
    return this.repository.save(params, input);
  }
}
