import 'reflect-metadata';

import type { Server } from 'node:http';
import { ValidationPipe } from '@nestjs/common';
import type { Provider, Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

import { GlobalExceptionFilter } from '../../../src/infrastructure/http/filters/globalException.filter.js';
import { ResponseInterceptor } from '../../../src/infrastructure/http/interceptors/response.interceptor.js';
import { validationExceptionFactory } from '../../../src/infrastructure/http/validation/validationException.factory.js';
import type { AuthSecurity } from '../../../src/modules/auth/application/ports/authSecurity.port.js';
import type { AuthRepository } from '../../../src/modules/auth/domain/repositories/auth.repository.js';
import type { AuthCookies } from '../../../src/modules/auth/presentation/http/authCookies.js';
import type { PostgresAuthRateLimit } from '../../../src/modules/auth/infrastructure/rateLimits/postgresAuthRateLimit.js';
import { AccessTokenGuard } from '../../../src/modules/auth/presentation/http/guards/accessToken.guard.js';

export const organizationId = '11111111-1111-4111-8111-111111111111';
export const itemId = '22222222-2222-4222-8222-222222222222';
export const userId = '33333333-3333-4333-8333-333333333333';

export async function createHttpFixture(controllers: Type<unknown>[], providers: Provider[]) {
  const module = await Test.createTestingModule({ controllers, providers }).compile();
  const app = module.createNestApplication();
  const verifyAccess = vi.fn<AuthSecurity['verifyAccess']>().mockResolvedValue({ sub: userId, sid: 'session' });
  const authenticate = vi.fn<AuthRepository['authenticate']>().mockResolvedValue({
    id: userId,
    name: 'Fixture',
    email: 'owner@example.invalid',
    selectedPlanPriceId: null,
    emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    disabledAt: null,
  });
  app.setGlobalPrefix('api');
  app.useGlobalGuards(new AccessTokenGuard(app.get(Reflector), { verifyAccess } as unknown as AuthSecurity,
    { authenticate } as unknown as AuthRepository, {} as AuthCookies, {} as PostgresAuthRateLimit));
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: validationExceptionFactory,
    validationError: { target: false, value: false }
  }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));

  await app.init();

  return {
    app,
    server: app.getHttpServer() as Server,
    verifyAccess,
    authenticate
  };
}
