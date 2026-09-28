import { HttpStatus } from '@nestjs/common';

import { httpOperation } from '../../../../infrastructure/http/errors/httpOperation.js';
import type { PublicProfileErrorCode } from '../../domain/errors/publicProfile.error.js';
import { PublicProfileError } from '../../domain/errors/publicProfile.error.js';

const statuses = {
  INVALID_PUBLIC_PROFILE_SLUG: HttpStatus.BAD_REQUEST,
  INVALID_PUBLIC_PROFILE_HEADLINE: HttpStatus.BAD_REQUEST,
  INVALID_PUBLIC_PROFILE_DESCRIPTION: HttpStatus.BAD_REQUEST,
  INVALID_PUBLIC_PROFILE_PHONE: HttpStatus.BAD_REQUEST,
  PUBLIC_PROFILE_CONTACT_REQUIRED: HttpStatus.BAD_REQUEST,
  PUBLIC_PROFILE_LOCATION_REQUIRED: HttpStatus.CONFLICT,
  PUBLIC_PROFILE_TOO_MANY_SERVICES: HttpStatus.BAD_REQUEST,
  PUBLIC_PROFILE_SERVICE_NOT_FOUND: HttpStatus.BAD_REQUEST,
  PUBLIC_PROFILE_SLUG_TAKEN: HttpStatus.CONFLICT,
  PUBLIC_PROFILE_NOT_FOUND: HttpStatus.NOT_FOUND,
  PUBLIC_PROFILE_CONTACT_UNAVAILABLE: HttpStatus.NOT_FOUND,
} satisfies Record<PublicProfileErrorCode, HttpStatus>;

export function publicProfileOperation<T>(operation: () => Promise<T>): Promise<T> {
  return httpOperation(
    operation,
    (error): error is PublicProfileError => error instanceof PublicProfileError,
    (error) => ({
      status: statuses[error.code],
      code: error.code,
      message: error.code.toLowerCase().replaceAll('_', ' '),
    }),
  );
}
