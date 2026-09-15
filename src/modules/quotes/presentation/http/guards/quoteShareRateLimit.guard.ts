import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

import { PrismaQuoteShareRateLimit } from '../../../infrastructure/rateLimits/prismaQuoteShareRateLimit.js';

@Injectable()
export class QuoteShareRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: PrismaQuoteShareRateLimit) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    await this.rateLimit.check(request.ip ?? request.socket.remoteAddress ?? 'unknown', http.getResponse<Response>());

    return true;
  }
}
