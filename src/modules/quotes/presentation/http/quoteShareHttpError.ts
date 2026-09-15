import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { QuoteShareErrorCode } from '../../domain/errors/quoteShare.error.js';
import { QuoteShareError } from '../../domain/errors/quoteShare.error.js';

import { quoteOperation } from './quoteHttpError.js';

const statuses = {
  QUOTE_SHARE_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_QUOTE_SHARE_EXPIRATION: HttpStatus.BAD_REQUEST,
  QUOTE_SHARE_ALREADY_DECIDED: HttpStatus.CONFLICT,
} satisfies Record<QuoteShareErrorCode, HttpStatus>;

export function quoteShareOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    () => quoteOperation(operation),
    (error): error is QuoteShareError => error instanceof QuoteShareError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: error.code.toLowerCase().replaceAll('_', ' '),
    }),
  );
}
