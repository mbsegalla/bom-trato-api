import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { ReceivableErrorCode } from '../../domain/errors/receivable.error.js';
import { ReceivableError } from '../../domain/errors/receivable.error.js';

const statuses = {
  ORGANIZATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  MEMBER_REQUIRED: HttpStatus.FORBIDDEN,
  VERIFIED_USER_REQUIRED: HttpStatus.FORBIDDEN,
  SUBSCRIPTION_REQUIRED: HttpStatus.FORBIDDEN,
  BILLING_RECONCILIATION_REQUIRED: HttpStatus.SERVICE_UNAVAILABLE,
  RECEIVABLES_BUSY: HttpStatus.SERVICE_UNAVAILABLE,
  WORK_ORDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  WORK_ORDER_CANCELED: HttpStatus.CONFLICT,
  RECEIVABLE_NOT_FOUND: HttpStatus.NOT_FOUND,
  RECEIVABLE_VERSION_CONFLICT: HttpStatus.CONFLICT,
  RECEIVABLE_NOT_EDITABLE: HttpStatus.CONFLICT,
  RECEIVABLE_HAS_PAYMENTS: HttpStatus.CONFLICT,
  INVALID_RECEIVABLE_INPUT: HttpStatus.BAD_REQUEST,
  INVALID_RECEIVABLE_AMOUNT: HttpStatus.BAD_REQUEST,
  INVALID_RECEIVABLE_DATE: HttpStatus.BAD_REQUEST,
  INVALID_RECEIVABLE_BALANCE: HttpStatus.CONFLICT,
  PAYMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  PAYMENT_EXCEEDS_BALANCE: HttpStatus.CONFLICT,
  PAYMENT_ALREADY_REVERSED: HttpStatus.CONFLICT,
  INVALID_PAYMENT_METHOD: HttpStatus.BAD_REQUEST,
  INVALID_PAYMENT_DATE: HttpStatus.BAD_REQUEST,
  IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  REASON_REQUIRED: HttpStatus.BAD_REQUEST,
} satisfies Record<ReceivableErrorCode, HttpStatus>;

export function receivableOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    operation,
    (error): error is ReceivableError => error instanceof ReceivableError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: error.code.toLowerCase().replaceAll('_', ' '),
    }),
  );
}
