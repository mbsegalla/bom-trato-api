import type { WorkOrderPhoto, WorkOrderPhotoProps } from '../entities/workOrderPhoto.entity.js';

export abstract class WorkOrderPhotoRepository {
  abstract list(): Promise<WorkOrderPhotoProps[]>;
  abstract count(): Promise<number>;
  abstract findById(photoId: string): Promise<WorkOrderPhotoProps | null>;
  abstract create(photo: WorkOrderPhoto): Promise<void>;
  abstract save(photo: WorkOrderPhoto, expectedVersion: number): Promise<void>;
  abstract delete(photoId: string, expectedVersion: number): Promise<void>;
}
