import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { WorkOrderWarrantyErrorCode } from '../../domain/errors/workOrderWarranty.error.js';
import { WorkOrderWarrantyError } from '../../domain/errors/workOrderWarranty.error.js';

import { workOrderOperation } from './workOrderHttpError.js';

const statuses = {
  INVALID_WORK_ORDER_WARRANTY: HttpStatus.BAD_REQUEST,
  WORK_ORDER_WARRANTY_LOCKED: HttpStatus.CONFLICT,
  WORK_ORDER_WARRANTY_VERSION_CONFLICT: HttpStatus.CONFLICT,
} satisfies Record<WorkOrderWarrantyErrorCode, HttpStatus>;

export function workOrderWarrantyOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    () => workOrderOperation(operation),
    (error): error is WorkOrderWarrantyError => error instanceof WorkOrderWarrantyError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: error.code.toLowerCase().replaceAll('_', ' '),
    }),
  );
}
