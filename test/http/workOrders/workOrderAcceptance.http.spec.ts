import 'reflect-metadata';

import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NextFunction, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiException } from '../../../src/infrastructure/http/exceptions/api.exception.js';
import { GlobalExceptionFilter } from '../../../src/infrastructure/http/filters/globalException.filter.js';
import { ResponseInterceptor } from '../../../src/infrastructure/http/interceptors/response.interceptor.js';
import { PostgresPublicShareRateLimit } from '../../../src/infrastructure/http/rateLimits/postgresPublicShareRateLimit.js';
import { validationExceptionFactory } from '../../../src/infrastructure/http/validation/validationException.factory.js';
import type { AuthRequest } from '../../../src/modules/auth/presentation/http/authRequest.js';
import type { WorkOrderAcceptanceReceipt } from '../../../src/modules/workOrders/application/types/workOrderAcceptance.types.js';
import { AcceptPublicWorkOrderUseCase } from '../../../src/modules/workOrders/application/useCases/acceptPublicWorkOrder.useCase.js';
import { GeneratePublicWorkOrderReportUseCase } from '../../../src/modules/workOrders/application/useCases/generatePublicWorkOrderReport.useCase.js';
import { GetPublicWorkOrderUseCase } from '../../../src/modules/workOrders/application/useCases/getPublicWorkOrder.useCase.js';
import { GetPublicWorkOrderPhotoContentUseCase } from '../../../src/modules/workOrders/application/useCases/getPublicWorkOrderPhotoContent.useCase.js';
import { GetWorkOrderAcceptanceUseCase } from '../../../src/modules/workOrders/application/useCases/getWorkOrderAcceptance.useCase.js';
import { PublicPortfolioConsentUseCase } from '../../../src/modules/workOrders/application/useCases/publicPortfolioConsent.useCase.js';
import { WORK_ORDER_ACCEPTANCE_CONSENT_TEXT } from '../../../src/modules/workOrders/domain/entities/workOrderAcceptance.entity.js';
import { WorkOrderError } from '../../../src/modules/workOrders/domain/errors/workOrder.error.js';
import { WorkOrderAcceptanceError } from '../../../src/modules/workOrders/domain/errors/workOrderAcceptance.error.js';
import { WorkOrderShareError } from '../../../src/modules/workOrders/domain/errors/workOrderShare.error.js';
import { PublicWorkOrdersController } from '../../../src/modules/workOrders/presentation/http/controllers/publicWorkOrders.controller.js';
import { WorkOrderAcceptanceController } from '../../../src/modules/workOrders/presentation/http/controllers/workOrderAcceptance.controller.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workOrderId = '22222222-2222-4222-8222-222222222222';
const userId = '44444444-4444-4444-8444-444444444444';
const privateRoute = `/api/organizations/${organizationId}/work-orders/${workOrderId}/acceptance`;
const publicRoute = '/api/public/work-orders/acceptance';
const token = 'a'.repeat(64);
const body = {
  token,
  snapshotHash: 'b'.repeat(64),
  signerName: 'Maria da Silva',
  consent: true,
  consentVersion: '1',
};
const receipt: WorkOrderAcceptanceReceipt = {
  id: '33333333-3333-4333-8333-333333333333',
  signerName: 'Maria da Silva',
  acceptedAt: new Date('2026-11-25T18:00:00.000Z'),
  completedAt: new Date('2026-11-25T16:00:00.000Z'),
  workOrderVersion: 4,
  consentVersion: '1',
  consentText: WORK_ORDER_ACCEPTANCE_CONSENT_TEXT,
  snapshotHash: body.snapshotHash,
  snapshot: {
    schemaVersion: 1,
    organizationName: 'Bom Trato',
    workOrder: {
      title: 'Instalação',
      currency: 'BRL',
      subtotalInCents: 10000,
      discountInCents: 0,
      totalInCents: 10000,
      completedAt: '2026-11-25T16:00:00.000Z',
      version: 4,
      items: [],
    },
  },
};

describe('work order acceptance HTTP contract', () => {
  let app: INestApplication<Server>;
  let server: Server;
  const accept = vi.fn<AcceptPublicWorkOrderUseCase['execute']>();
  const internal = vi.fn<GetWorkOrderAcceptanceUseCase['execute']>();
  const rateLimit = vi.fn<PostgresPublicShareRateLimit['check']>();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PublicWorkOrdersController, WorkOrderAcceptanceController],
      providers: [
        { provide: AcceptPublicWorkOrderUseCase, useValue: { execute: accept } },
        { provide: GetWorkOrderAcceptanceUseCase, useValue: { execute: internal } },
        { provide: GetPublicWorkOrderUseCase, useValue: { execute: async () => ({}) } },
        { provide: GeneratePublicWorkOrderReportUseCase, useValue: { execute: async () => new Uint8Array() } },
        {
          provide: PublicPortfolioConsentUseCase,
          useValue: {
            status: async () => ({}),
            consent: async () => ({}),
            revoke: async () => ({}),
          },
        },
        { provide: GetPublicWorkOrderPhotoContentUseCase, useValue: { execute: async () => new Uint8Array() } },
        { provide: PostgresPublicShareRateLimit, useValue: { check: rateLimit } },
      ],
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
    accept.mockReset().mockResolvedValue({ acceptedAt: receipt.acceptedAt, completedAt: receipt.completedAt });
    internal.mockReset().mockResolvedValue({ receipt });
    rateLimit.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => app?.close());

  it('accepts a private token and explicit consent without login, normalizes the name and limits the public receipt', async () => {
    const response = await request(server)
      .post(publicRoute)
      .send({ ...body, signerName: '  Maria\t da\nSilva  ' })
      .expect('Cache-Control', 'private, no-store')
      .expect('Referrer-Policy', 'no-referrer')
      .expect('X-Robots-Tag', 'noindex, nofollow, noarchive')
      .expect(200);

    expect(accept).toHaveBeenCalledWith(token, body);
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(response.body).toMatchObject({
      success: true,
      statusCode: 200,
      data: { acceptedAt: '2026-11-25T18:00:00.000Z', completedAt: '2026-11-25T16:00:00.000Z' },
    });
    expect(Object.keys((response.body as { data: object }).data).sort()).toEqual(['acceptedAt', 'completedAt']);
    expect(response.text).not.toContain('Maria');
    expect(response.text).not.toContain(body.snapshotHash);
    expect(response.text).not.toContain(token);
  });

  it.each([
    { signerName: null },
    { signerName: '' },
    { signerName: '  ' },
    { signerName: 'A' },
    { signerName: 'x'.repeat(101) },
    { signerName: 123 },
    { consent: null },
    { consent: false },
    { consent: 'true' },
    { consent: 1 },
    { consentVersion: null },
    { consentVersion: 1 },
    { consentVersion: '' },
    { consentVersion: 'x'.repeat(21) },
    { snapshotHash: null },
    { snapshotHash: 'b'.repeat(63) },
    { snapshotHash: 'B'.repeat(64) },
    { token: null },
    { token: 'invalid' },
    { token: 'A'.repeat(64) },
    { acceptedAt: '2026-11-25T18:00:00.000Z' },
    { completedAt: '2026-11-25T16:00:00.000Z' },
    { workOrderId },
    { organizationId },
    { shareId: 'id' },
    { consentText: 'Forged' },
    { snapshot: {} },
  ])('rejects malformed input or caller-supplied audit fields %j', async (change) => {
    await request(server)
      .post(publicRoute)
      .send({ ...body, ...change })
      .expect(400);

    expect(accept).not.toHaveBeenCalled();
  });

  it.each(['token', 'snapshotHash', 'signerName', 'consent', 'consentVersion'] as const)(
    'requires %s in the request body',
    async (field) => {
      const payload: Record<string, unknown> = { ...body };
      delete payload[field];

      await request(server).post(`${publicRoute}?${field}=ignored`).send(payload).expect(400);

      expect(accept).not.toHaveBeenCalled();
    },
  );

  it('passes a well-formed previous consent version to the use case for a stale snapshot conflict', async () => {
    accept.mockRejectedValueOnce(new WorkOrderAcceptanceError('WORK_ORDER_ACCEPTANCE_SNAPSHOT_CONFLICT'));

    const response = await request(server)
      .post(publicRoute)
      .send({ ...body, consentVersion: '0' })
      .expect(409);

    expect(accept).toHaveBeenCalledWith(token, { ...body, consentVersion: '0' });
    expect(response.body).toMatchObject({ success: false, error: { code: 'WORK_ORDER_ACCEPTANCE_SNAPSHOT_CONFLICT' } });
  });

  it.each([
    ['WORK_ORDER_ACCEPTANCE_NOT_AVAILABLE', 409],
    ['WORK_ORDER_ACCEPTANCE_SNAPSHOT_CONFLICT', 409],
    ['WORK_ORDER_ALREADY_ACCEPTED', 409],
    ['INVALID_WORK_ORDER_ACCEPTANCE_INPUT', 400],
  ] as const)('maps %s to the standard error envelope', async (code, status) => {
    accept.mockRejectedValueOnce(new WorkOrderAcceptanceError(code));

    const response = await request(server).post(publicRoute).send(body).expect(status);

    expect(response.body).toMatchObject({ success: false, statusCode: status, error: { code } });
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it.each([
    [new WorkOrderShareError('WORK_ORDER_SHARE_NOT_FOUND'), 404],
    [new WorkOrderError('SUBSCRIPTION_REQUIRED'), 403],
    [new WorkOrderError('BILLING_RECONCILIATION_REQUIRED'), 503],
    [new WorkOrderError('WORK_ORDERS_BUSY'), 503],
  ] as const)('preserves existing token and platform errors %s', async (error, status) => {
    accept.mockRejectedValueOnce(error);

    const response = await request(server).post(publicRoute).send(body).expect(status);

    expect(response.body).toMatchObject({ success: false, statusCode: status, error: { code: error.code } });
    expect(response.text).not.toContain(token);
  });

  it('applies rate limiting before invoking acceptance while preserving privacy headers', async () => {
    rateLimit.mockRejectedValueOnce(
      new ApiException(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMIT_EXCEEDED', 'Too many requests'),
    );

    await request(server).post(publicRoute).send(body).expect('Referrer-Policy', 'no-referrer').expect(429);

    expect(accept).not.toHaveBeenCalled();
  });

  it('returns the private record through authenticated organization and work order scope', async () => {
    const response = await request(server)
      .get(privateRoute)
      .set('Authorization', 'Bearer fixture')
      .expect('Cache-Control', 'private, no-store')
      .expect(200);

    expect(internal).toHaveBeenCalledWith({ organizationId, workOrderId, userId });
    expect(response.body).toMatchObject({
      success: true,
      data: {
        receipt: {
          signerName: 'Maria da Silva',
          workOrderVersion: 4,
          consentText: WORK_ORDER_ACCEPTANCE_CONSENT_TEXT,
          snapshot: receipt.snapshot,
        },
      },
    });
  });

  it('represents a pending acceptance explicitly without inventing a receipt', async () => {
    internal.mockResolvedValueOnce({ receipt: null });

    const response = await request(server).get(privateRoute).set('Authorization', 'Bearer fixture').expect(200);

    expect(response.body).toMatchObject({ data: { receipt: null } });
  });

  it('requires authentication for private reads and validates both scope identifiers', async () => {
    await request(server).get(privateRoute).expect(401);
    await request(server)
      .get(privateRoute.replace(organizationId, 'invalid'))
      .set('Authorization', 'Bearer fixture')
      .expect(400);
    await request(server)
      .get(privateRoute.replace(workOrderId, 'invalid'))
      .set('Authorization', 'Bearer fixture')
      .expect(400);

    expect(internal).not.toHaveBeenCalled();
  });
});
