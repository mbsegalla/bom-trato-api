import type { HttpStatus } from '@nestjs/common';
import { HttpException } from '@nestjs/common';

import type { ApiError, ApiErrorDetail } from '../responses/apiResponse.types.js';

export class ApiException extends HttpException {
  readonly publicError: ApiError;

  constructor(statusCode: HttpStatus, code: string, message: string, details: ApiErrorDetail[] = []) {
    super({ code, message, details }, statusCode);

    this.publicError = { code, message, details };
  }
}
