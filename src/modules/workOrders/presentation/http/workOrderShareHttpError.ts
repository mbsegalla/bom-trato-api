import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { WorkOrderShareErrorCode } from '../../domain/errors/workOrderShare.error.js';
import { WorkOrderShareError } from '../../domain/errors/workOrderShare.error.js';

import { workOrderOperation } from './workOrderHttpError.js';

const statuses = {
  WORK_ORDER_SHARE_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_WORK_ORDER_SHARE_EXPIRATION: HttpStatus.BAD_REQUEST,
} satisfies Record<WorkOrderShareErrorCode, HttpStatus>;

export function workOrderShareOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    () => workOrderOperation(operation),
    (error): error is WorkOrderShareError => error instanceof WorkOrderShareError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: error.code.toLowerCase().replaceAll('_', ' '),
    }),
  );
}
