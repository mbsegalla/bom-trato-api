import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { WorkOrderPhotoRepository } from '../../domain/repositories/workOrderPhoto.repository.js';
import type { WorkOrderByIdParams } from '../types/workOrder.types.js';

export interface WorkOrderPhotoReadContext {
  readonly access: OrganizationAccessContext;
  readonly photos: Pick<WorkOrderPhotoRepository, 'list' | 'count' | 'findById'>;
  workOrderExists(): Promise<boolean>;
}

export interface WorkOrderPhotoTransaction extends WorkOrderPhotoReadContext {
  readonly photos: WorkOrderPhotoRepository;
}

export abstract class WorkOrderPhotoUnitOfWork {
  abstract read<T>(
    params: WorkOrderByIdParams,
    operation: (context: WorkOrderPhotoReadContext) => Promise<T>,
  ): Promise<T>;
  abstract run<T>(params: WorkOrderByIdParams, operation: (tx: WorkOrderPhotoTransaction) => Promise<T>): Promise<T>;
}
