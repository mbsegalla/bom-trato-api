import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

import { requestLogContext } from '../../logging/requestLogContext.js';
import { safeError } from '../../logging/safeError.js';
import { ApiException } from '../exceptions/api.exception.js';
import { ApiError, ApiErrorResponse } from '../responses/apiResponse.types.js';

function getHttpMessage(exception: HttpException): string {
  const body: unknown = exception.getResponse();

  if (typeof body === 'string') {
    return body;
  }

  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message: unknown = body.message;

    if (typeof message === 'string') {
      return message;
    }

    if (Array.isArray(message)) {
      const messages = message.filter((item: unknown): item is string => typeof item === 'string');

      if (messages.length > 0) {
        return messages.join('; ');
      }
    }
  }

  return exception.message;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter<unknown> {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();

    const statusCode = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let error: ApiError = {
      code: statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : `HTTP_${statusCode}`,
      message: 'An unexpected error occurred.',
      details: [],
    };

    if (statusCode >= 500) {
      this.logger.error({
        message: 'HTTP request failed',
        ...requestLogContext(),
        statusCode,
        ...safeError(exception),
      });
    } else if (exception instanceof ApiException) {
      error = exception.publicError;
    } else if (exception instanceof HttpException) {
      error = {
        code: `HTTP_${statusCode}`,
        message: getHttpMessage(exception),
        details: [],
      };
    }

    if (response.headersSent) {
      return;
    }

    const body: ApiErrorResponse = {
      statusCode,
      success: false,
      error,
    };

    response.status(statusCode).json(body);
  }
}
