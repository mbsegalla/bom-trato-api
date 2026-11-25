import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { WorkOrderAcceptanceSource } from '../../domain/entities/workOrderAcceptance.entity.js';
import type { WorkOrderAcceptanceRepository } from '../../domain/repositories/workOrderAcceptance.repository.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';

export interface WorkOrderAcceptanceReadContext {
  readonly access: OrganizationAccessContext;
  readonly acceptances: Pick<WorkOrderAcceptanceRepository, 'findForCompletion'>;
  findWorkOrder(): Promise<WorkOrderAcceptanceSource | null>;
}

export abstract class WorkOrderAcceptanceUnitOfWork {
  abstract read<T>(
    params: WorkOrderByIdParams,
    operation: (context: WorkOrderAcceptanceReadContext) => Promise<T>,
  ): Promise<T>;
}
