import { HttpStatus } from '@nestjs/common';

import { ApiException } from '../../../../infrastructure/http/exceptions/api.exception.js';
import type { WorkOrderErrorCode } from '../../domain/errors/workOrder.error.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';

const statuses = {
  ORGANIZATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  MEMBER_REQUIRED: HttpStatus.FORBIDDEN,
  VERIFIED_USER_REQUIRED: HttpStatus.FORBIDDEN,
  SUBSCRIPTION_REQUIRED: HttpStatus.FORBIDDEN,
  BILLING_RECONCILIATION_REQUIRED: HttpStatus.SERVICE_UNAVAILABLE,
  QUOTE_NOT_FOUND: HttpStatus.NOT_FOUND,
  QUOTE_NOT_APPROVED: HttpStatus.CONFLICT,
  WORK_ORDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  WORK_ORDER_VERSION_CONFLICT: HttpStatus.CONFLICT,
  WORK_ORDER_NOT_EDITABLE: HttpStatus.CONFLICT,
  INVALID_WORK_ORDER_TRANSITION: HttpStatus.CONFLICT,
  INVALID_WORK_ORDER_INPUT: HttpStatus.BAD_REQUEST,
  INVALID_WORK_ORDER_SCHEDULE: HttpStatus.BAD_REQUEST,
  ASSIGNEE_REQUIRED: HttpStatus.CONFLICT,
  ASSIGNEE_NOT_AVAILABLE: HttpStatus.CONFLICT,
  SERVICE_ADDRESS_REQUIRED: HttpStatus.CONFLICT,
  CANCELLATION_REASON_REQUIRED: HttpStatus.BAD_REQUEST,
  WORK_ORDERS_BUSY: HttpStatus.SERVICE_UNAVAILABLE,
} satisfies Record<WorkOrderErrorCode, HttpStatus>;

export async function workOrderOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (!(error instanceof WorkOrderError)) {
      throw error;
    }

    throw new ApiException(statuses[error.code], error.code, error.code.toLowerCase().replaceAll('_', ' '));
  }
}
