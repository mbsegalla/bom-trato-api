import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { ReviewErrorCode } from '../../domain/errors/review.error.js';
import { ReviewError } from '../../domain/errors/review.error.js';

const statuses = {
  REVIEW_INVITATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  REVIEW_INVITATION_EXPIRED: HttpStatus.GONE,
  REVIEW_ALREADY_SUBMITTED: HttpStatus.CONFLICT,
  REVIEW_WORK_ORDER_NOT_COMPLETED: HttpStatus.CONFLICT,
  REVIEW_PUBLIC_PROFILE_REQUIRED: HttpStatus.CONFLICT,
  INVALID_REVIEW_RATING: HttpStatus.BAD_REQUEST,
  INVALID_REVIEW_COMMENT: HttpStatus.BAD_REQUEST,
} satisfies Record<ReviewErrorCode, HttpStatus>;

export function reviewOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    operation,
    (error): error is ReviewError => error instanceof ReviewError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: error.code.toLowerCase().replaceAll('_', ' '),
    }),
  );
}
