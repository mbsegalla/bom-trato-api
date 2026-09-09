import { HttpStatus } from '@nestjs/common';

import { ApiException } from '../../../../infrastructure/http/exceptions/api.exception.js';
import type { OrganizationErrorCode } from '../../domain/errors/organization.error.js';
import { OrganizationError } from '../../domain/errors/organization.error.js';

const definitions = {
  INVALID_ORGANIZATION_NAME: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Organization name must contain 2 to 100 characters.',
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
