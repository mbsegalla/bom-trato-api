import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { WorkOrderAcceptanceErrorCode } from '../../domain/errors/workOrderAcceptance.error.js';
import { WorkOrderAcceptanceError } from '../../domain/errors/workOrderAcceptance.error.js';

import { workOrderShareOperation } from './workOrderShareHttpError.js';

const statuses = {
  WORK_ORDER_ACCEPTANCE_NOT_AVAILABLE: HttpStatus.CONFLICT,
  WORK_ORDER_ACCEPTANCE_SNAPSHOT_CONFLICT: HttpStatus.CONFLICT,
  WORK_ORDER_ALREADY_ACCEPTED: HttpStatus.CONFLICT,
  INVALID_WORK_ORDER_ACCEPTANCE_INPUT: HttpStatus.BAD_REQUEST,
} satisfies Record<WorkOrderAcceptanceErrorCode, HttpStatus>;

export function workOrderAcceptanceOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    () => workOrderShareOperation(operation),
    (error): error is WorkOrderAcceptanceError => error instanceof WorkOrderAcceptanceError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: error.code.toLowerCase().replaceAll('_', ' '),
    }),
  );
}
