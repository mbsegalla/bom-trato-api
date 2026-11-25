export type WorkOrderPhotoErrorCode =
  | 'WORK_ORDER_PHOTO_NOT_FOUND'
  | 'WORK_ORDER_PHOTO_REQUIRED'
  | 'INVALID_WORK_ORDER_PHOTO'
  | 'INVALID_WORK_ORDER_PHOTO_INPUT'
  | 'WORK_ORDER_PHOTO_TOO_LARGE'
  | 'WORK_ORDER_PHOTO_LIMIT_REACHED'
  | 'WORK_ORDER_PHOTO_VERSION_CONFLICT'
  | 'WORK_ORDER_PHOTO_STORAGE_FAILED';

export class WorkOrderPhotoError extends Error {
  constructor(readonly code: WorkOrderPhotoErrorCode) {
    super(code);

    this.name = 'WorkOrderPhotoError';
  }
}
