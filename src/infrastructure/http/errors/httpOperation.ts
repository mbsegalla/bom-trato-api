import type { HttpStatus } from '@nestjs/common';

import { ApiException } from '../exceptions/api.exception.js';

interface HttpErrorDescription {
  status: HttpStatus;
  code: string;
  message: string;
}

export async function httpOperation<T, E extends Error>(
  operation: () => Promise<T>,
  isExpectedError: (error: unknown) => error is E,
  describe: (error: E) => HttpErrorDescription,
): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (!isExpectedError(error)) {
      throw error;
    }

    const description = describe(error);

    throw new ApiException(description.status, description.code, description.message);
  }
}
