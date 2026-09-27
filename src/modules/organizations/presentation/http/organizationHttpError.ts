import { HttpStatus } from '@nestjs/common';

import { ApiException } from '../../../../infrastructure/http/exceptions/api.exception.js';
import type { OrganizationErrorCode } from '../../domain/errors/organization.error.js';
import { OrganizationError } from '../../domain/errors/organization.error.js';

const definitions = {
  INVALID_ORGANIZATION_NAME: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Organization name must contain 2 to 100 characters.',
  },
  INVALID_ORGANIZATION_EMAIL: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Organization email is invalid.',
  },
  INVALID_ORGANIZATION_PHONE: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Organization phone is invalid.',
  },
  INVALID_ORGANIZATION_DOCUMENT: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Organization document is invalid.',
  },
  INVALID_ORGANIZATION_ADDRESS: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Organization address is invalid.',
  },
  INVALID_ORGANIZATION_CITY: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Organization city is invalid.',
  },
  INVALID_ORGANIZATION_STATE: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Organization state must contain two letters.',
  },
  INVALID_ORGANIZATION_POSTAL_CODE: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Organization postal code must contain eight digits.',
  },
  INVALID_ORGANIZATION_LOGO: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Organization logo is invalid.',
  },
  ORGANIZATION_LOGO_REQUIRED: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Organization logo file is required.',
  },
  ORGANIZATION_LOGO_TOO_LARGE: {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    message: 'Organization logo must not exceed 2 MB.',
  },
  ORGANIZATION_LOGO_STORAGE_FAILED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Organization logo storage is temporarily unavailable.',
  },
  EMPTY_ORGANIZATION_UPDATE: {
    status: HttpStatus.BAD_REQUEST,
    message: 'At least one organization field must be updated.',
  },
  IDEMPOTENCY_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'This idempotency key was already used with different organization data.',
  },
  VERIFIED_USER_REQUIRED: {
    status: HttpStatus.FORBIDDEN,
    message: 'An active user with a verified email is required.',
  },
} satisfies Record<OrganizationErrorCode, { status: HttpStatus; message: string }>;

export async function organizationOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (!(error instanceof OrganizationError)) {
      throw error;
    }

    const { status, message } = definitions[error.code];

    throw new ApiException(status, error.code, message);
  }
}
