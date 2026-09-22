import { HttpStatus } from '@nestjs/common';

import { ApiException } from '../../../../infrastructure/http/exceptions/api.exception.js';
import { UserError } from '../../../users/domain/errors/user.error.js';
import { AuthError } from '../../domain/errors/auth.error.js';

export function toAuthHttpError(error: unknown): unknown {
  if (!(error instanceof AuthError) && !(error instanceof UserError)) {
    return error;
  }

  if (error.code === 'EMAIL_ALREADY_EXISTS') {
    return new ApiException(HttpStatus.CONFLICT, error.code, 'An account with this email already exists.');
  }

  if (error.code === 'EMAIL_NOT_VERIFIED') {
    return new ApiException(HttpStatus.FORBIDDEN, error.code, 'Verify your email before signing in.');
  }

  if (error.code === 'INVALID_PASSWORD') {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      error.code,
      'Password must be between 12 and 128 characters, contain at least one uppercase letter and one special character.',
    );
  }

  if (error.code === 'INVALID_CREDENTIALS') {
    return new ApiException(HttpStatus.UNAUTHORIZED, error.code, 'Invalid email or password.');
  }

  return new ApiException(HttpStatus.UNAUTHORIZED, 'INVALID_SESSION', 'Authentication is invalid or expired.');
}

export async function authOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    throw toAuthHttpError(error);
  }
}
