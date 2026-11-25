import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

import { PostgresPublicShareRateLimit } from '../../../../../infrastructure/http/rateLimits/postgresPublicShareRateLimit.js';

@Injectable()
export class WorkOrderShareRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: PostgresPublicShareRateLimit) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();

    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    this.applyPrivacyHeaders(response);

    await this.rateLimit.check(request.ip ?? request.socket.remoteAddress ?? 'unknown', response);

    return true;
  }

  private applyPrivacyHeaders(response: Response): void {
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');

    response.setHeader('Referrer-Policy', 'no-referrer');

    response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

    response.setHeader('X-Content-Type-Options', 'nosniff');
  }
}
