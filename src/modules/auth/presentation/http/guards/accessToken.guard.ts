import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Response } from 'express';

import type { AuthSecurity } from '../../../application/ports/authSecurity.port.js';
import type { AuthRepository } from '../../../domain/repositories/auth.repository.js';
import type { PostgresAuthRateLimiter } from '../../../infrastructure/security/postgresAuthRateLimiter.js';
import type { AuthCookies } from '../authCookies.js';
import { toAuthHttpError } from '../authHttpError.js';
import type { AuthRequest } from '../authRequest.js';
import type { AuthEndpointPolicy } from '../decorators/authEndpoint.decorator.js';
import { AUTH_ENDPOINT } from '../decorators/authEndpoint.decorator.js';
import { PUBLIC_ROUTE } from '../decorators/publicRoute.decorator.js';

export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly security: AuthSecurity,
    private readonly authRepository: AuthRepository,
    private readonly cookies: AuthCookies,
    private readonly rateLimiter: PostgresAuthRateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    const targets = [context.getHandler(), context.getClass()];

    const endpoint = this.reflector.getAllAndOverride<AuthEndpointPolicy | undefined>(AUTH_ENDPOINT, targets);

    if (endpoint) {
      response.setHeader('Cache-Control', 'no-store');

      await this.rateLimiter.check(request, response, endpoint.bucket);

      if (endpoint.mutation) {
        this.cookies.assertCsrf(request);
      } else if (endpoint.bucket === 'csrf') {
        this.cookies.assertOrigin(request);
      }
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets);

    if (isPublic) {
      return true;
    }

    const authorization = request.get('authorization') ?? '';
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);

    if (!match?.[1] || match[1].length > 4096) {
      throw new UnauthorizedException('Authentication required.');
    }

    try {
      const claims = await this.security.verifyAccess(match[1]);

      const user = await this.authRepository.authenticate(
        {
          userId: claims.sub,
          sessionId: claims.sid,
        },
        new Date(),
      );

      request.auth = {
        user,
        sessionId: claims.sid,
      };

      return true;
    } catch (error: unknown) {
      throw toAuthHttpError(error);
    }
  }
}
