import 'reflect-metadata';

import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NextFunction, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GlobalExceptionFilter } from '../src/infrastructure/http/filters/globalException.filter.js';
import { ResponseInterceptor } from '../src/infrastructure/http/interceptors/response.interceptor.js';
import { validationExceptionFactory } from '../src/infrastructure/http/validation/validationException.factory.js';
import type { AuthRequest } from '../src/modules/auth/presentation/http/authRequest.js';
import type {
  SaveWorkOrderRecurrenceInput,
  WorkOrderRecurrenceListView,
  WorkOrderRecurrenceView,
} from '../src/modules/workOrders/application/types/workOrderRecurrence.types.js';
import { ManageWorkOrderRecurrenceUseCase } from '../src/modules/workOrders/application/useCases/manageWorkOrderRecurrence.useCase.js';
import { WorkOrderError } from '../src/modules/workOrders/domain/errors/workOrder.error.js';
import { WorkOrderRecurrenceController } from '../src/modules/workOrders/presentation/http/controllers/workOrderRecurrence.controller.js';
import { WorkOrderRecurrencesController } from '../src/modules/workOrders/presentation/http/controllers/workOrderRecurrences.controller.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workOrderId = '22222222-2222-4222-8222-222222222222';
const customerId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const quoteId = '55555555-5555-4555-8555-555555555555';
const route = `/api/organizations/${organizationId}/work-orders/${workOrderId}/recurrence`;
const listRoute = `/api/organizations/${organizationId}/work-order-recurrences`;

const input: SaveWorkOrderRecurrenceInput = {
  intervalUnit: 'MONTH',
  intervalCount: 1,
  nextVisitOn: '2027-01-31',
  enabled: true,
  version: 2,
};
const recurrence = {
  ...input,
  autoGenerateEnabled: true,
  lastGeneratedQuoteId: quoteId,
  lastGeneratedVisitOn: '2026-12-31',
};
const view: WorkOrderRecurrenceView = {
  recurrence,
  canConfigure: true,
  customerArchived: false,
  today: '2027-01-01',
  completedOn: '2026-11-25',
};
const page: WorkOrderRecurrenceListView = {
  items: [{ workOrderId, customerId, customerName: 'Cliente', title: 'Limpeza', customerArchived: false, recurrence }],
  page: 2,
  hasMore: true,
  today: view.today,
  canConfigure: true,
};

describe('work order recurrence HTTP contract', () => {
  let app: INestApplication<Server>;
  let server: Server;
  const read = vi.fn<ManageWorkOrderRecurrenceUseCase['read']>();
  const save = vi.fn<ManageWorkOrderRecurrenceUseCase['save']>();
  const list = vi.fn<ManageWorkOrderRecurrenceUseCase['list']>();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WorkOrderRecurrenceController, WorkOrderRecurrencesController],
      providers: [{ provide: ManageWorkOrderRecurrenceUseCase, useValue: { read, save, list } }],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use((req: AuthRequest, _res: Response, next: NextFunction) => {
      if (req.headers.authorization === 'Bearer fixture') {
        req.auth = {
          sessionId: 'session',
          user: {
            id: userId,
            name: 'Member',
            email: 'member@example.com',
            selectedPlanPriceId: null,
            emailVerifiedAt: new Date(),
            disabledAt: null,
          },
        };
      }

      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
        validationError: { target: false, value: false },
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));
    await app.init();
    server = app.getHttpServer();
  });

  beforeEach(() => {
    read.mockReset().mockResolvedValue(view);
    save.mockReset().mockResolvedValue({ ...view, recurrence: { ...recurrence, version: 3 } });
    list.mockReset().mockResolvedValue(page);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns the configuration and generation history with the private response envelope', async () => {
    const response = await request(server)
      .get(route)
      .set('Authorization', 'Bearer fixture')
      .expect('Cache-Control', 'private, no-store')
      .expect(200);

    expect(read).toHaveBeenCalledWith({ organizationId, workOrderId, userId });
    expect(response.body).toMatchObject({ statusCode: 200, success: true, data: view });
  });

  it('returns a null configuration without inventing a plan', async () => {
    read.mockResolvedValueOnce({ ...view, recurrence: null });

    const response = await request(server).get(route).set('Authorization', 'Bearer fixture').expect(200);

    expect(response.body).toMatchObject({ data: { recurrence: null } });
  });

  it.each([true, false])('accepts explicit generation opt-in %s', async (autoGenerateEnabled) => {
    const body = { ...input, autoGenerateEnabled };
    const response = await request(server)
      .put(route)
      .set('Authorization', 'Bearer fixture')
      .send(body)
      .expect('Cache-Control', 'private, no-store')
      .expect(200);

    expect(save).toHaveBeenCalledWith({ organizationId, workOrderId, userId }, expect.objectContaining(body));
    expect(response.body).toMatchObject({ data: { recurrence: { version: 3 } } });
  });

  it('keeps the opt-in absent for older clients and quick pause actions', async () => {
    await request(server)
      .put(route)
      .set('Authorization', 'Bearer fixture')
      .send({ ...input, enabled: false })
      .expect(200);

    expect(save.mock.calls[0][1].autoGenerateEnabled).toBeUndefined();
  });

  it('accepts version zero on initial configuration', async () => {
    await request(server)
      .put(route)
      .set('Authorization', 'Bearer fixture')
      .send({ ...input, version: 0 })
      .expect(200);

    expect(save).toHaveBeenCalledWith({ organizationId, workOrderId, userId }, expect.objectContaining({ version: 0 }));
  });

  it.each([
    {},
    { ...input, autoGenerateEnabled: null },
    { ...input, autoGenerateEnabled: 'true' },
    { ...input, enabled: 'false' },
    { ...input, intervalUnit: 'YEAR' },
    { ...input, intervalCount: 0 },
    { ...input, intervalCount: 366 },
    { ...input, intervalCount: 1.5 },
    { ...input, nextVisitOn: '2027-01-31T00:00:00.000Z' },
    { ...input, version: -1 },
    { ...input, version: '2' },
    { ...input, version: 2147483648 },
    { ...input, lastGeneratedQuoteId: quoteId },
    { ...input, organizationId },
    { ...input, userId },
  ])('rejects malformed configuration or caller-controlled audit fields', async (body) => {
    await request(server).put(route).set('Authorization', 'Bearer fixture').send(body).expect(400);
    expect(save).not.toHaveBeenCalled();
  });

  it('transforms pagination, trims the customer filter and returns the list contract', async () => {
    const response = await request(server)
      .get(listRoute)
      .query({ page: '2', limit: '5', status: 'ACTIVE', visit: 'NEXT_SEVEN_DAYS', customerName: ' Cliente ' })
      .set('Authorization', 'Bearer fixture')
      .expect('Cache-Control', 'private, no-store')
      .expect(200);

    expect(list).toHaveBeenCalledWith(
      { organizationId, userId },
      expect.objectContaining({
        page: 2,
        limit: 5,
        status: 'ACTIVE',
        visit: 'NEXT_SEVEN_DAYS',
        customerName: 'Cliente',
      }),
    );
    expect(response.body).toMatchObject({ statusCode: 200, success: true, data: page });
  });

  it('applies the standard pagination defaults', async () => {
    await request(server).get(listRoute).set('Authorization', 'Bearer fixture').expect(200);
    expect(list).toHaveBeenCalledWith({ organizationId, userId }, expect.objectContaining({ page: 1, limit: 10 }));
  });

  it.each([
    { page: '0' },
    { limit: '101' },
    { page: '1.5' },
    { status: 'ALL' },
    { visit: 'TOMORROW' },
    { customerName: 'x'.repeat(101) },
    { organizationId },
    { userId },
  ])('rejects unsupported list queries before the use case runs', async (query) => {
    await request(server).get(listRoute).query(query).set('Authorization', 'Bearer fixture').expect(400);
    expect(list).not.toHaveBeenCalled();
  });

  it('requires authentication on all private routes', async () => {
    await request(server).get(route).expect(401);
    await request(server).put(route).send(input).expect(401);
    await request(server).get(listRoute).expect(401);
    expect(read).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('rejects invalid organization and work order identifiers', async () => {
    await request(server).get(route.replace(workOrderId, 'invalid')).set('Authorization', 'Bearer fixture').expect(400);
    await request(server)
      .get(listRoute.replace(organizationId, 'invalid'))
      .set('Authorization', 'Bearer fixture')
      .expect(400);

    expect(read).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it.each([
    ['WORK_ORDER_NOT_FOUND', 404],
    ['WORK_ORDER_NOT_COMPLETED', 409],
    ['WORK_ORDER_RECURRENCE_CUSTOMER_ARCHIVED', 409],
    ['WORK_ORDER_RECURRENCE_VERSION_CONFLICT', 409],
    ['INVALID_WORK_ORDER_RECURRENCE', 400],
    ['MEMBER_REQUIRED', 403],
    ['VERIFIED_USER_REQUIRED', 403],
    ['SUBSCRIPTION_REQUIRED', 403],
    ['BILLING_RECONCILIATION_REQUIRED', 503],
    ['WORK_ORDERS_BUSY', 503],
  ] as const)('maps %s to the standard HTTP error envelope', async (code, status) => {
    save.mockRejectedValueOnce(new WorkOrderError(code));

    const response = await request(server).put(route).set('Authorization', 'Bearer fixture').send(input).expect(status);

    expect(response.body).toMatchObject({ statusCode: status, success: false, error: { code } });
  });
});
