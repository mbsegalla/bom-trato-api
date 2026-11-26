import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import type { WorkOrderDocumentRepository } from '../ports/workOrderDocumentRepository.port.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';
import type { WorkOrderWarrantyResult } from '../types/workOrderDocument.types.js';

export class GetWorkOrderWarrantyUseCase {
  constructor(private readonly repository: WorkOrderDocumentRepository) {}

  async execute(params: WorkOrderByIdParams): Promise<WorkOrderWarrantyResult> {
    const context = await this.repository.read(params);
    OrganizationAccessPolicy.assertVerifiedMember(context.access, (code) => new WorkOrderError(code));

    return {
      warranty: context.data.warranty,
      locked: context.accepted || context.data.workOrder.status === 'CANCELED',
    };
  }
}
