import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { CatalogServiceErrorCode } from '../../domain/errors/catalogService.error.js';
import { CatalogServiceError } from '../../domain/errors/catalogService.error.js';

const statuses = {
  ORGANIZATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  MEMBER_REQUIRED: HttpStatus.FORBIDDEN,
  VERIFIED_USER_REQUIRED: HttpStatus.FORBIDDEN,
  SUBSCRIPTION_REQUIRED: HttpStatus.FORBIDDEN,
  BILLING_RECONCILIATION_REQUIRED: HttpStatus.SERVICE_UNAVAILABLE,
  CATALOG_SERVICE_NOT_FOUND: HttpStatus.NOT_FOUND,
  CATALOG_SERVICE_ARCHIVED: HttpStatus.CONFLICT,
  INVALID_CATALOG_SERVICE_NAME: HttpStatus.BAD_REQUEST,
  INVALID_CATALOG_SERVICE_DESCRIPTION: HttpStatus.BAD_REQUEST,
  INVALID_CATALOG_SERVICE_UNIT: HttpStatus.BAD_REQUEST,
  INVALID_CATALOG_SERVICE_AMOUNT: HttpStatus.BAD_REQUEST,
  EMPTY_CATALOG_SERVICE_UPDATE: HttpStatus.BAD_REQUEST,
  CATALOG_BUSY: HttpStatus.SERVICE_UNAVAILABLE,
} satisfies Record<CatalogServiceErrorCode, HttpStatus>;

export function catalogServiceOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    operation,
    (error): error is CatalogServiceError => error instanceof CatalogServiceError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: error.code.toLowerCase().replaceAll('_', ' '),
    }),
  );
}
