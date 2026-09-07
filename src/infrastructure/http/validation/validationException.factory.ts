import { HttpStatus } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

import { ApiException } from '../exceptions/api.exception.js';
import type { ApiErrorDetail } from '../responses/apiResponse.types.js';

function flattenValidationErrors(errors: ValidationError[], parent = ''): ApiErrorDetail[] {
  return errors.flatMap((error) => {
    const property = (error as unknown as { property: string }).property;
    const field = parent ? `${parent}.${property}` : property;
    const constraints = (error as unknown as { constraints?: Record<string, string> }).constraints ?? {};
    const messages = Object.values(constraints);
    const details: ApiErrorDetail[] = [];

    if (messages.length > 0) {
      details.push({ field, messages });
    }

    const children = (error as unknown as { children?: ValidationError[] }).children ?? [];

    details.push(...flattenValidationErrors(children, field));

    return details;
  });
}

export function validationExceptionFactory(errors: ValidationError[]): ApiException {
  return new ApiException(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_ERROR',
    'Some fields are invalid.',
    flattenValidationErrors(errors),
  );
}
