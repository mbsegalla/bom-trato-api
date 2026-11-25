import { WorkOrderWarrantyError } from '../../domain/errors/workOrderWarranty.error.js';
import type { WorkOrderDocumentRepository } from '../ports/workOrderDocumentRepository.port.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';
import type { UpdateWorkOrderWarrantyInput, WorkOrderWarrantyResult } from '../types/workOrderDocument.types.js';

export class UpdateWorkOrderWarrantyUseCase {
  constructor(private readonly repository: WorkOrderDocumentRepository) {}

  execute(params: WorkOrderByIdParams, input: UpdateWorkOrderWarrantyInput): Promise<WorkOrderWarrantyResult> {
    if (
      !Number.isSafeInteger(input.durationDays) ||
      input.durationDays < 1 ||
      input.durationDays > 3650 ||
      !Number.isSafeInteger(input.version) ||
      input.version < 0 ||
      typeof input.terms !== 'string' ||
      input.terms.trim().length < 1 ||
      input.terms.trim().length > 2000
    ) {
      throw new WorkOrderWarrantyError('INVALID_WORK_ORDER_WARRANTY');
    }

    return this.repository.saveWarranty(params, {
      durationDays: input.durationDays,
      terms: input.terms.trim(),
      version: input.version,
    });
  }
}
