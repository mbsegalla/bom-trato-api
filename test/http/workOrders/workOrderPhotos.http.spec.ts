import 'reflect-metadata';

import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NextFunction, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseInterceptor } from '../../../src/infrastructure/http/interceptors/response.interceptor.js';
import { PostgresPublicShareRateLimit } from '../../../src/infrastructure/http/rateLimits/postgresPublicShareRateLimit.js';
import { validationExceptionFactory } from '../../../src/infrastructure/http/validation/validationException.factory.js';
import type { AuthRequest } from '../../../src/modules/auth/presentation/http/authRequest.js';
import { PUBLIC_ROUTE } from '../../../src/modules/auth/presentation/http/decorators/publicRoute.decorator.js';
import type { WorkOrderPhotoView } from '../../../src/modules/workOrders/application/types/workOrderPhoto.types.js';
import { AcceptPublicWorkOrderUseCase } from '../../../src/modules/workOrders/application/useCases/acceptPublicWorkOrder.useCase.js';
import { DeleteWorkOrderPhotoUseCase } from '../../../src/modules/workOrders/application/useCases/deleteWorkOrderPhoto.useCase.js';
import { GeneratePublicWorkOrderReportUseCase } from '../../../src/modules/workOrders/application/useCases/generatePublicWorkOrderReport.useCase.js';
import { GetPublicWorkOrderUseCase } from '../../../src/modules/workOrders/application/useCases/getPublicWorkOrder.useCase.js';
import { GetPublicWorkOrderPhotoContentUseCase } from '../../../src/modules/workOrders/application/useCases/getPublicWorkOrderPhotoContent.useCase.js';
import { GetWorkOrderPhotoContentUseCase } from '../../../src/modules/workOrders/application/useCases/getWorkOrderPhotoContent.useCase.js';
import { ListWorkOrderPhotosUseCase } from '../../../src/modules/workOrders/application/useCases/listWorkOrderPhotos.useCase.js';
import { PublicPortfolioConsentUseCase } from '../../../src/modules/workOrders/application/useCases/publicPortfolioConsent.useCase.js';
import { UpdateWorkOrderPhotoUseCase } from '../../../src/modules/workOrders/application/useCases/updateWorkOrderPhoto.useCase.js';
import { UploadWorkOrderPhotoUseCase } from '../../../src/modules/workOrders/application/useCases/uploadWorkOrderPhoto.useCase.js';
import { WORK_ORDER_PHOTO_MAX_FILE_SIZE } from '../../../src/modules/workOrders/domain/entities/workOrderPhoto.entity.js';
import { PublicWorkOrdersController } from '../../../src/modules/workOrders/presentation/http/controllers/publicWorkOrders.controller.js';
import { WorkOrderPhotosController } from '../../../src/modules/workOrders/presentation/http/controllers/workOrderPhotos.controller.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workOrderId = '22222222-2222-4222-8222-222222222222';
const photoId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const route = `/api/organizations/${organizationId}/work-orders/${workOrderId}/photos`;
const token = 'a'.repeat(64);
const photo: WorkOrderPhotoView = {
  id: photoId,
  stage: 'BEFORE',
  caption: 'Antes do serviço',
  visibleInPortal: false,
  width: 800,
  height: 600,
  sizeInBytes: 4,
  version: 1,
  createdAt: new Date('2026-11-25T12:00:00.000Z'),
  updatedAt: new Date('2026-11-25T12:00:00.000Z'),
};

describe('work order photo HTTP contract', () => {
  let app: INestApplication<Server>;
  let server: Server;
  const upload = vi.fn<UploadWorkOrderPhotoUseCase['execute']>().mockResolvedValue(photo);
  const content = vi.fn<GetWorkOrderPhotoContentUseCase['execute']>().mockResolvedValue(new Uint8Array([1, 2, 3]));
  const publicContent = vi
    .fn<GetPublicWorkOrderPhotoContentUseCase['execute']>()
    .mockResolvedValue(new Uint8Array([1, 2, 3]));
  const rateLimit = vi.fn<PostgresPublicShareRateLimit['check']>().mockResolvedValue(undefined);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WorkOrderPhotosController, PublicWorkOrdersController],
      providers: [
        { provide: ListWorkOrderPhotosUseCase, useValue: { execute: async () => [photo] } },
        { provide: UploadWorkOrderPhotoUseCase, useValue: { execute: upload } },
        { provide: UpdateWorkOrderPhotoUseCase, useValue: { execute: async () => photo } },
        { provide: DeleteWorkOrderPhotoUseCase, useValue: { execute: async () => undefined } },
        { provide: GetWorkOrderPhotoContentUseCase, useValue: { execute: content } },
        { provide: GetPublicWorkOrderUseCase, useValue: { execute: async () => ({}) } },
        { provide: GeneratePublicWorkOrderReportUseCase, useValue: { execute: async () => new Uint8Array() } },
        {
          provide: PublicPortfolioConsentUseCase,
          useValue: { status: async () => ({}), consent: async () => ({}), revoke: async () => ({}) },
        },
        { provide: AcceptPublicWorkOrderUseCase, useValue: { execute: async () => ({}) } },
        { provide: GetPublicWorkOrderPhotoContentUseCase, useValue: { execute: publicContent } },
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
    app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));
    await app.init();
    server = app.getHttpServer();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('accepts file, stage and caption together and returns the normal response envelope', async () => {
    const response = await request(server)
      .post(route)
      .set('Authorization', 'Bearer fixture')
      .field('stage', 'BEFORE')
      .field('caption', '  Antes do serviço  ')
      .attach('file', Buffer.from([1, 2, 3]), { filename: 'before.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0][0]).toEqual({ organizationId, workOrderId, userId });
    expect(upload.mock.calls[0][1]).toMatchObject({ stage: 'BEFORE', caption: 'Antes do serviço' });
    expect(upload.mock.calls[0][2]).toMatchObject({ size: 3, mimeType: 'image/jpeg', buffer: Buffer.from([1, 2, 3]) });
    expect(response.body).toMatchObject({
      statusCode: 201,
      success: true,
      data: { id: photoId, visibleInPortal: false },
    });
  });

  it('rejects an extra visibility field and invalid stages before invoking the use case', async () => {
    await request(server)
      .post(route)
      .set('Authorization', 'Bearer fixture')
      .field('stage', 'BEFORE')
      .field('visibleInPortal', 'true')
      .attach('file', Buffer.from([1]), 'before.jpg')
      .expect(400);
    await request(server)
      .post(route)
      .set('Authorization', 'Bearer fixture')
      .field('stage', 'OTHER')
      .attach('file', Buffer.from([1]), 'before.jpg')
      .expect(400);

    expect(upload).not.toHaveBeenCalled();
  });

  it('accepts exactly 10 MiB at the multipart boundary and rejects larger files', async () => {
    await request(server)
      .post(route)
      .set('Authorization', 'Bearer fixture')
      .field('stage', 'BEFORE')
      .attach('file', Buffer.alloc(WORK_ORDER_PHOTO_MAX_FILE_SIZE), 'before.jpg')
      .expect(201);

    expect(upload.mock.calls[0][2].size).toBe(WORK_ORDER_PHOTO_MAX_FILE_SIZE);

    await request(server)
      .post(route)
      .set('Authorization', 'Bearer fixture')
      .field('stage', 'BEFORE')
      .attach('file', Buffer.alloc(WORK_ORDER_PHOTO_MAX_FILE_SIZE + 1), 'before.jpg')
      .expect(413);

    expect(upload).toHaveBeenCalledOnce();
  });

  it('returns private WebP bytes without the JSON response envelope', async () => {
    const response = await request(server)
      .get(`${route}/${photoId}/content`)
      .set('Authorization', 'Bearer fixture')
      .expect('Content-Type', 'image/webp')
      .expect('Cache-Control', 'private, no-store, max-age=0')
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(200);

    expect(response.body).toEqual(Buffer.from([1, 2, 3]));
    expect(content).toHaveBeenCalledWith({ organizationId, workOrderId, userId, photoId });

    await request(server).get(`${route}/${photoId}/content`).expect(401);
    expect(content).toHaveBeenCalledOnce();
  });

  it('validates the public POST token and uses the real privacy/rate limit guard', async () => {
    const publicRoute = `/api/public/work-orders/photos/${photoId}/content`;
    const response = await request(server)
      .post(publicRoute)
      .send({ token })
      .expect('Content-Type', 'image/webp')
      .expect('Cache-Control', 'private, no-store, max-age=0')
      .expect('X-Robots-Tag', 'noindex, nofollow, noarchive')
      .expect('X-Content-Type-Options', 'nosniff')
      .expect(200);

    expect(response.body).toEqual(Buffer.from([1, 2, 3]));
    expect(publicContent).toHaveBeenCalledWith(token, photoId);
    expect(rateLimit).toHaveBeenCalledOnce();
    expect(new Reflector().get(PUBLIC_ROUTE, PublicWorkOrdersController)).toBe(true);

    await request(server).post(publicRoute).send({ token: 'invalid' }).expect(400);
    await request(server).post(`${publicRoute}?token=${token}`).send({}).expect(400);
    expect(publicContent).toHaveBeenCalledOnce();
  });
});
