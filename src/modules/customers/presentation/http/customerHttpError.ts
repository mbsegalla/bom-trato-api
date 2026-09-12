import { HttpStatus } from '@nestjs/common';

import { ApiException } from '../../../../infrastructure/http/exceptions/api.exception.js';
import type { CustomerErrorCode } from '../../domain/errors/customer.error.js';
import { CustomerError } from '../../domain/errors/customer.error.js';

const statuses = {
  ORGANIZATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  MEMBER_REQUIRED: HttpStatus.FORBIDDEN,
  VERIFIED_USER_REQUIRED: HttpStatus.FORBIDDEN,
  SUBSCRIPTION_REQUIRED: HttpStatus.FORBIDDEN,
  BILLING_RECONCILIATION_REQUIRED: HttpStatus.SERVICE_UNAVAILABLE,
  CUSTOMER_NOT_FOUND: HttpStatus.NOT_FOUND,
  CUSTOMER_ARCHIVED: HttpStatus.CONFLICT,
  INVALID_CUSTOMER_NAME: HttpStatus.BAD_REQUEST,
  INVALID_CUSTOMER_EMAIL: HttpStatus.BAD_REQUEST,
  INVALID_CUSTOMER_PHONE: HttpStatus.BAD_REQUEST,
  INVALID_CUSTOMER_NOTES: HttpStatus.BAD_REQUEST,
  EMPTY_CUSTOMER_UPDATE: HttpStatus.BAD_REQUEST,
  CUSTOMERS_BUSY: HttpStatus.SERVICE_UNAVAILABLE,
} satisfies Record<CustomerErrorCode, HttpStatus>;

export async function customerOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (!(error instanceof CustomerError)) {
      throw error;
    }

    throw new ApiException(statuses[error.code], error.code, error.code.toLowerCase().replaceAll('_', ' '));
  }
}
