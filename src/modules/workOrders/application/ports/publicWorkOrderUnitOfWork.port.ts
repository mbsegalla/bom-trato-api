import type { WorkOrderPhotoProps } from '../../domain/entities/workOrderPhoto.entity.js';
import type { WorkOrderShareProps } from '../../domain/entities/workOrderShare.entity.js';
import type { PublicWorkOrderSnapshot } from '../types/publicWorkOrder.types.js';

export interface PublicWorkOrderReadContext {
  readonly share: WorkOrderShareProps;
  findWorkOrder(): Promise<PublicWorkOrderSnapshot | null>;
  findPhoto(photoId: string): Promise<WorkOrderPhotoProps | null>;
}

export abstract class PublicWorkOrderUnitOfWork {
  abstract read<T>(tokenHash: string, operation: (context: PublicWorkOrderReadContext) => Promise<T>): Promise<T>;
}
