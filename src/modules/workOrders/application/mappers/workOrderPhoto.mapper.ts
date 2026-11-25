import type { WorkOrderPhotoProps } from '../../domain/entities/workOrderPhoto.entity.js';
import type { PublicWorkOrderPhoto, WorkOrderPhotoView } from '../types/workOrderPhoto.types.js';

export function toPublicWorkOrderPhoto(photo: PublicWorkOrderPhoto): PublicWorkOrderPhoto {
  return {
    id: photo.id,
    stage: photo.stage,
    caption: photo.caption,
    width: photo.width,
    height: photo.height,
    createdAt: photo.createdAt,
  };
}

export function toWorkOrderPhotoView(photo: WorkOrderPhotoProps): WorkOrderPhotoView {
  return {
    ...toPublicWorkOrderPhoto(photo),
    visibleInPortal: photo.visibleInPortal,
    sizeInBytes: photo.sizeInBytes,
    version: photo.version,
    updatedAt: photo.updatedAt,
  };
}
