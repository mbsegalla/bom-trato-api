import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
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

export function quoteOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    operation,
    (error): error is QuoteError => error instanceof QuoteError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: error.code.toLowerCase().replaceAll('_', ' '),
    }),
  );
}
