import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { WorkOrderChecklistErrorCode } from '../../domain/errors/workOrderChecklist.error.js';
import { WorkOrderChecklistError } from '../../domain/errors/workOrderChecklist.error.js';

import { workOrderOperation } from './workOrderHttpError.js';

const statuses = {
  WORK_ORDER_CHECKLIST_ITEM_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_WORK_ORDER_CHECKLIST_INPUT: HttpStatus.BAD_REQUEST,
  WORK_ORDER_CHECKLIST_LIMIT_REACHED: HttpStatus.CONFLICT,
  WORK_ORDER_CHECKLIST_VERSION_CONFLICT: HttpStatus.CONFLICT,
} satisfies Record<WorkOrderChecklistErrorCode, HttpStatus>;

export function workOrderChecklistOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    () => workOrderOperation(operation),
    (error): error is WorkOrderChecklistError => error instanceof WorkOrderChecklistError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: error.code.toLowerCase().replaceAll('_', ' '),
    }),
  );
}
