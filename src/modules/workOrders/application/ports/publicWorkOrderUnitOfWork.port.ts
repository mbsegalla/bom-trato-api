import type { OrganizationPlatformAccess } from '../../../organizations/domain/policies/organizationPlatformAccess.policy.js';
import type { WorkOrderPhotoProps } from '../../domain/entities/workOrderPhoto.entity.js';
import type { WorkOrderShareProps } from '../../domain/entities/workOrderShare.entity.js';
import type { WorkOrderAcceptanceRepository } from '../../domain/repositories/workOrderAcceptance.repository.js';
import type { PublicWorkOrderSnapshot } from '../types/publicWorkOrder.types.js';

export interface PublicWorkOrderReadContext {
  readonly share: WorkOrderShareProps;
  readonly acceptances: Pick<WorkOrderAcceptanceRepository, 'findForCompletion'>;
  findPlatformAccess(): Promise<OrganizationPlatformAccess>;
  findWorkOrder(): Promise<PublicWorkOrderSnapshot | null>;
  findPhoto(photoId: string): Promise<WorkOrderPhotoProps | null>;
}

export interface PublicWorkOrderTransaction extends PublicWorkOrderReadContext {
  readonly acceptances: WorkOrderAcceptanceRepository;
}

export abstract class PublicWorkOrderUnitOfWork {
  abstract read<T>(tokenHash: string, operation: (context: PublicWorkOrderReadContext) => Promise<T>): Promise<T>;
  abstract run<T>(tokenHash: string, operation: (tx: PublicWorkOrderTransaction) => Promise<T>): Promise<T>;
}
