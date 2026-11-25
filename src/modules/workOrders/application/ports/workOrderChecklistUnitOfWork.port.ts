import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { WorkOrderChecklistRepository } from '../../domain/repositories/workOrderChecklist.repository.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';

export interface WorkOrderChecklistReadContext {
  readonly access: OrganizationAccessContext;
  readonly checklist: Pick<WorkOrderChecklistRepository, 'list' | 'findById'>;
  workOrderExists(): Promise<boolean>;
}

export interface WorkOrderChecklistTransaction extends WorkOrderChecklistReadContext {
  readonly checklist: WorkOrderChecklistRepository;
}

export abstract class WorkOrderChecklistUnitOfWork {
  abstract read<T>(
    params: WorkOrderByIdParams,
    operation: (context: WorkOrderChecklistReadContext) => Promise<T>,
  ): Promise<T>;
  abstract run<T>(
    params: WorkOrderByIdParams,
    operation: (tx: WorkOrderChecklistTransaction) => Promise<T>,
  ): Promise<T>;
}
