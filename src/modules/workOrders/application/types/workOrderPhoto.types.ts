import type { WorkOrderPhotoProps } from '../../domain/entities/workOrderPhoto.entity.js';

import type { WorkOrderByIdParams } from './workOrder.types.js';

export interface WorkOrderPhotoByIdParams extends WorkOrderByIdParams {
  photoId: string;
}

export interface ChangeWorkOrderPhotoParams extends WorkOrderPhotoByIdParams {
  version: number;
}

export type WorkOrderPhotoView = Pick<
  WorkOrderPhotoProps,
  | 'id'
  | 'stage'
  | 'caption'
  | 'visibleInPortal'
  | 'width'
  | 'height'
  | 'sizeInBytes'
  | 'version'
  | 'createdAt'
  | 'updatedAt'
>;

export type PublicWorkOrderPhoto = Pick<
  WorkOrderPhotoProps,
  'id' | 'stage' | 'caption' | 'width' | 'height' | 'createdAt'
>;
