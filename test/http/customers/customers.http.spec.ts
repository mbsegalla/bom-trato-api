import 'reflect-metadata';

import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GlobalExceptionFilter } from '../../../src/infrastructure/http/filters/globalException.filter.js';
import { ResponseInterceptor } from '../../../src/infrastructure/http/interceptors/response.interceptor.js';
import { validationExceptionFactory } from '../../../src/infrastructure/http/validation/validationException.factory.js';
import type { AuthSecurity } from '../../../src/modules/auth/application/ports/authSecurity.port.js';
import type { AuthRepository } from '../../../src/modules/auth/domain/repositories/auth.repository.js';
import { AuthError } from '../../../src/modules/auth/domain/errors/auth.error.js';
import type { AuthCookies } from '../../../src/modules/auth/presentation/http/authCookies.js';
import type { PostgresAuthRateLimit } from '../../../src/modules/auth/infrastructure/rateLimits/postgresAuthRateLimit.js';
import { AccessTokenGuard } from '../../../src/modules/auth/presentation/http/guards/accessToken.guard.js';
import { ArchiveCustomerUseCase } from '../../../src/modules/customers/application/useCases/archiveCustomer.useCase.js';
import { CreateCustomerUseCase } from '../../../src/modules/customers/application/useCases/createCustomer.useCase.js';
import { GetCustomerUseCase } from '../../../src/modules/customers/application/useCases/getCustomer.useCase.js';
import { GetCustomerOverviewUseCase } from '../../../src/modules/customers/application/useCases/getCustomerOverview.useCase.js';
import { ListCustomersUseCase } from '../../../src/modules/customers/application/useCases/listCustomers.useCase.js';
import { RestoreCustomerUseCase } from '../../../src/modules/customers/application/useCases/restoreCustomer.useCase.js';
import { UpdateCustomerUseCase } from '../../../src/modules/customers/application/useCases/updateCustomer.useCase.js';
import { CustomerError } from '../../../src/modules/customers/domain/errors/customer.error.js';
import { CustomersController } from '../../../src/modules/customers/presentation/http/controllers/customers.controller.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const customerId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const route = '/api/organizations/' + organizationId + '/customers';
const now = new Date('2026-01-01T00:00:00Z');
const customer = {
  id: customerId,
  organizationId,
  name: 'Fixture customer',
  email: null,
  phone: '34999991234',
  defaultServiceAddress: null,
  notes: null,
  archivedAt: null,
  createdAt: now,
  updatedAt: now
};

describe('customer HTTP authentication and validation', () => {
  let app: INestApplication<Server>;
  let server: Server;
  const verifyAccess = vi.fn<AuthSecurity['verifyAccess']>();
  const authenticate = vi.fn<AuthRepository['authenticate']>();
  const create = vi.fn<CreateCustomerUseCase['execute']>();
  const get = vi.fn<GetCustomerUseCase['execute']>();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        { provide: CreateCustomerUseCase, useValue: { execute: create } },
        { provide: GetCustomerUseCase, useValue: { execute: get } },
        ...[
          ArchiveCustomerUseCase,
          GetCustomerOverviewUseCase,
          ListCustomersUseCase,
          RestoreCustomerUseCase,
          UpdateCustomerUseCase
        ].map(
          (provide) => ({ provide, useValue: { execute: vi.fn() } }),
        ),
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalGuards(new AccessTokenGuard(
      app.get(Reflector),
      { verifyAccess } as unknown as AuthSecurity,
      { authenticate } as unknown as AuthRepository,
      {} as AuthCookies,
      {} as PostgresAuthRateLimit,
    ));
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
      validationError: { target: false, value: false },
    }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));

    await app.init();
    server = app.getHttpServer();
  });

  beforeEach(() => {
    verifyAccess.mockReset().mockResolvedValue({ sub: userId, sid: 'session' });
    authenticate.mockReset().mockResolvedValue({
      id: userId,
      name: 'Fixture',
      email: 'owner@example.invalid',
      selectedPlanPriceId: null,
      emailVerifiedAt: now,
      disabledAt: null
    });
    create.mockReset().mockResolvedValue(customer);
    get.mockReset().mockResolvedValue(customer);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects absent and malformed bearer headers before token verification', async () => {
    await request(server).get(route + '/' + customerId).expect(401);
    await request(server).get(route + '/' + customerId).set('Authorization', 'Basic invalid').expect(401);

    expect(verifyAccess).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('does not dispatch a controller for a revoked session', async () => {
    authenticate.mockRejectedValueOnce(new AuthError('INVALID_SESSION'));

    await request(server).get(route + '/' + customerId).set('Authorization', 'Bearer fixture').expect(401);

    expect(authenticate).toHaveBeenCalledWith({ userId, sessionId: 'session' }, expect.any(Date));
    expect(get).not.toHaveBeenCalled();
  });

  it('uses the authenticated actor and rejects body attempts to override it', async () => {
    const input = { name: ' Fixture customer ', phone: '34999991234' };

    await request(server).post(route).set('Authorization', 'Bearer fixture').send({ ...input, userId: customerId }).expect(400);

    expect(create).not.toHaveBeenCalled();

    await request(server).post(route).set('Authorization', 'Bearer fixture').send(input).expect(201);

    expect(create).toHaveBeenCalledWith(
      { organizationId, userId },
      expect.objectContaining({
        name: 'Fixture customer',
        phone: input.phone
      })
    );
  });

  it('maps tenant denial and hidden identifiers to 403 and 404 without leaking customer data', async () => {
    get.mockRejectedValueOnce(new CustomerError('MEMBER_REQUIRED'));

    await request(server).get(route + '/' + customerId).set('Authorization', 'Bearer fixture').expect(403);
    get.mockRejectedValueOnce(new CustomerError('CUSTOMER_NOT_FOUND'));

    const missing = await request(server).get(route + '/' + customerId).set('Authorization', 'Bearer fixture').expect(404);

    expect(JSON.stringify(missing.body)).not.toContain(customer.name);

    await request(server).get(route + '/invalid-uuid').set('Authorization', 'Bearer fixture').expect(400);

    expect(get).toHaveBeenCalledTimes(2);
  });
});
