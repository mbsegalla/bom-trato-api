import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { AddressErrorCode } from '../../domain/errors/address.error.js';
import { AddressError } from '../../domain/errors/address.error.js';

const statuses = {
  INVALID_POSTAL_CODE: HttpStatus.BAD_REQUEST,
  POSTAL_CODE_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_STATE: HttpStatus.BAD_REQUEST,
  ADDRESS_PROVIDER_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  ADDRESS_PROVIDER_INVALID_RESPONSE: HttpStatus.BAD_GATEWAY,
} satisfies Record<AddressErrorCode, HttpStatus>;

const messages = {
  INVALID_POSTAL_CODE: 'invalid postal code',
  POSTAL_CODE_NOT_FOUND: 'postal code not found',
  INVALID_STATE: 'invalid state',
  ADDRESS_PROVIDER_UNAVAILABLE: 'address provider unavailable',
  ADDRESS_PROVIDER_INVALID_RESPONSE: 'invalid address provider response',
} satisfies Record<AddressErrorCode, string>;

export function addressOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    operation,
    (error): error is AddressError => error instanceof AddressError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: messages[error.code],
    }),
  );
}
