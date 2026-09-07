import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { map, Observable } from 'rxjs';

import { RESPONSE_ENVELOPE } from '../decorators/responseEnvelope.decorator.js';
import { ApiSuccessResponse } from '../responses/apiResponse.types.js';

@Injectable()
export class ResponseInterceptor implements NestInterceptor<unknown, unknown> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const responseEnvelop = this.reflector.getAllAndOverride<boolean>(RESPONSE_ENVELOPE, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (responseEnvelop) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      map((data: unknown) => {
        if (response.headersSent || data instanceof StreamableFile) {
          return data;
        }

        const statusCode = response.statusCode;

        if (request.method === 'HEAD' || statusCode === 204 || statusCode === 205 || statusCode === 304) {
          return undefined;
        }

        if (statusCode < 200 || statusCode >= 300) {
          return data;
        }

        const body: ApiSuccessResponse<unknown> = {
          statusCode,
          success: true,
          data: data ?? null,
        };

        return body;
      }),
    );
  }
}
