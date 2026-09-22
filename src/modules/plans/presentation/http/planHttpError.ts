import { HttpStatus } from '@nestjs/common';

import { ApiException } from '../../../../infrastructure/http/exceptions/api.exception.js';
import type { PlanErrorCode } from '../../domain/errors/plan.error.js';
import { PlanError } from '../../domain/errors/plan.error.js';

const definitions = {
  PLAN_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'The requested plan was not found.',
  },
  PLAN_PRICE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'The requested plan price was not found.',
  },
} satisfies Record<PlanErrorCode, { status: HttpStatus; message: string }>;

export async function organizationOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (!(error instanceof PlanError)) {
      throw error;
    }

    const { status, message } = definitions[error.code];

    throw new ApiException(status, error.code, message);
  }
}
