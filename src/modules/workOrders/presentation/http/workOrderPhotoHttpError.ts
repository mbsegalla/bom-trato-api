import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { WorkOrderPhotoErrorCode } from '../../domain/errors/workOrderPhoto.error.js';
import { WorkOrderPhotoError } from '../../domain/errors/workOrderPhoto.error.js';

import { workOrderShareOperation } from './workOrderShareHttpError.js';

const statuses = {
  WORK_ORDER_PHOTO_NOT_FOUND: HttpStatus.NOT_FOUND,
  WORK_ORDER_PHOTO_REQUIRED: HttpStatus.BAD_REQUEST,
  INVALID_WORK_ORDER_PHOTO: HttpStatus.BAD_REQUEST,
  INVALID_WORK_ORDER_PHOTO_INPUT: HttpStatus.BAD_REQUEST,
  WORK_ORDER_PHOTO_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  WORK_ORDER_PHOTO_LIMIT_REACHED: HttpStatus.CONFLICT,
  WORK_ORDER_PHOTO_VERSION_CONFLICT: HttpStatus.CONFLICT,
  WORK_ORDER_PHOTO_STORAGE_FAILED: HttpStatus.SERVICE_UNAVAILABLE,
} satisfies Record<WorkOrderPhotoErrorCode, HttpStatus>;

export function workOrderPhotoOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    () => workOrderShareOperation(operation),
    (error): error is WorkOrderPhotoError => error instanceof WorkOrderPhotoError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: error.code.toLowerCase().replaceAll('_', ' '),
    }),
  );
}
