import { HttpStatus } from '@nestjs/common';

import { ApiException } from '../../../../infrastructure/http/exceptions/api.exception.js';
import type { QuoteErrorCode } from '../../domain/errors/quote.error.js';
import { QuoteError } from '../../domain/errors/quote.error.js';

const statuses = {
  ORGANIZATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  MEMBER_REQUIRED: HttpStatus.FORBIDDEN,
  VERIFIED_USER_REQUIRED: HttpStatus.FORBIDDEN,
  SUBSCRIPTION_REQUIRED: HttpStatus.FORBIDDEN,
  BILLING_RECONCILIATION_REQUIRED: HttpStatus.SERVICE_UNAVAILABLE,
  QUOTE_NOT_FOUND: HttpStatus.NOT_FOUND,
  QUOTE_ITEM_NOT_FOUND: HttpStatus.NOT_FOUND,
  CUSTOMER_NOT_FOUND: HttpStatus.NOT_FOUND,
  CUSTOMER_ARCHIVED: HttpStatus.CONFLICT,
  CATALOG_SERVICE_NOT_FOUND: HttpStatus.NOT_FOUND,
  CATALOG_SERVICE_ARCHIVED: HttpStatus.CONFLICT,
  QUOTE_NOT_EDITABLE: HttpStatus.CONFLICT,
  QUOTE_VERSION_CONFLICT: HttpStatus.CONFLICT,
  INVALID_QUOTE_TRANSITION: HttpStatus.CONFLICT,
  QUOTE_EXPIRED: HttpStatus.CONFLICT,
  QUOTE_EMPTY: HttpStatus.CONFLICT,
  QUOTE_ITEM_LIMIT: HttpStatus.CONFLICT,
  INVALID_QUOTE_INPUT: HttpStatus.BAD_REQUEST,
  INVALID_QUOTE_ITEM: HttpStatus.BAD_REQUEST,
  INVALID_QUOTE_AMOUNT: HttpStatus.BAD_REQUEST,
  INVALID_QUOTE_DISCOUNT: HttpStatus.BAD_REQUEST,
  INVALID_QUOTE_VALIDITY: HttpStatus.BAD_REQUEST,
  QUOTES_BUSY: HttpStatus.SERVICE_UNAVAILABLE,
} satisfies Record<QuoteErrorCode, HttpStatus>;

export async function quoteOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (!(error instanceof QuoteError)) {
      throw error;
    }

    throw new ApiException(statuses[error.code], error.code, error.code.toLowerCase().replaceAll('_', ' '));
  }
}
