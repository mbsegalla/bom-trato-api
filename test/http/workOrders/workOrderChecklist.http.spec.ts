import 'reflect-metadata';

import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NextFunction, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GlobalExceptionFilter } from '../../../src/infrastructure/http/filters/globalException.filter.js';
import { ResponseInterceptor } from '../../../src/infrastructure/http/interceptors/response.interceptor.js';
import { validationExceptionFactory } from '../../../src/infrastructure/http/validation/validationException.factory.js';
import type { AuthRequest } from '../../../src/modules/auth/presentation/http/authRequest.js';
import type { WorkOrderChecklistItemView } from '../../../src/modules/workOrders/application/types/workOrderChecklist.types.js';
import { CreateWorkOrderChecklistItemUseCase } from '../../../src/modules/workOrders/application/useCases/createWorkOrderChecklistItem.useCase.js';
import { DeleteWorkOrderChecklistItemUseCase } from '../../../src/modules/workOrders/application/useCases/deleteWorkOrderChecklistItem.useCase.js';
import { ListWorkOrderChecklistUseCase } from '../../../src/modules/workOrders/application/useCases/listWorkOrderChecklist.useCase.js';
import { ReorderWorkOrderChecklistUseCase } from '../../../src/modules/workOrders/application/useCases/reorderWorkOrderChecklist.useCase.js';
import { UpdateWorkOrderChecklistItemUseCase } from '../../../src/modules/workOrders/application/useCases/updateWorkOrderChecklistItem.useCase.js';
import { WorkOrderChecklistError } from '../../../src/modules/workOrders/domain/errors/workOrderChecklist.error.js';
import { WorkOrderChecklistController } from '../../../src/modules/workOrders/presentation/http/controllers/workOrderChecklist.controller.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workOrderId = '22222222-2222-4222-8222-222222222222';
const itemId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const route = `/api/organizations/${organizationId}/work-orders/${workOrderId}/checklist`;
const item: WorkOrderChecklistItemView = {
  id: itemId,
  title: 'Verificar a instalação',
  position: 0,
  completed: false,
  completedAt: null,
  completedById: null,
  visibleInPortal: false,
  version: 1,
  createdAt: new Date('2026-11-25T12:00:00.000Z'),
  updatedAt: new Date('2026-11-25T12:00:00.000Z'),
};
const checklist = { items: [item], progress: { total: 1, completed: 0 } };

describe('work order checklist HTTP contract', () => {
  let app: INestApplication<Server>;
  let server: Server;
  const list = vi.fn<ListWorkOrderChecklistUseCase['execute']>();
  const create = vi.fn<CreateWorkOrderChecklistItemUseCase['execute']>();
  const update = vi.fn<UpdateWorkOrderChecklistItemUseCase['execute']>();
  const remove = vi.fn<DeleteWorkOrderChecklistItemUseCase['execute']>();
  const reorder = vi.fn<ReorderWorkOrderChecklistUseCase['execute']>();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WorkOrderChecklistController],
      providers: [
        { provide: ListWorkOrderChecklistUseCase, useValue: { execute: list } },
        { provide: CreateWorkOrderChecklistItemUseCase, useValue: { execute: create } },
        { provide: UpdateWorkOrderChecklistItemUseCase, useValue: { execute: update } },
        { provide: DeleteWorkOrderChecklistItemUseCase, useValue: { execute: remove } },
        { provide: ReorderWorkOrderChecklistUseCase, useValue: { execute: reorder } },
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
    list.mockReset().mockResolvedValue(checklist);
    create.mockReset().mockResolvedValue(item);
    update.mockReset().mockResolvedValue(item);
    remove.mockReset().mockResolvedValue(undefined);
    reorder.mockReset().mockResolvedValue(checklist);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('lists private items and progress with the standard response envelope and no-store header', async () => {
    const response = await request(server)
      .get(route)
      .set('Authorization', 'Bearer fixture')
      .expect('Cache-Control', 'private, no-store')
      .expect(200);

    expect(list).toHaveBeenCalledWith({ organizationId, workOrderId, userId });
    expect(response.body).toMatchObject({
      success: true,
      statusCode: 200,
      data: { items: [{ id: itemId, completedById: null }], progress: { total: 1, completed: 0 } },
    });
  });

  it('creates a private item from a trimmed title and derives the actor from authentication', async () => {
    const response = await request(server)
      .post(route)
      .set('Authorization', 'Bearer fixture')
      .send({ title: '  Verificar a instalação  ' })
      .expect(201);

    expect(create).toHaveBeenCalledWith({ organizationId, workOrderId, userId }, { title: 'Verificar a instalação' });
    expect(response.body).toMatchObject({
      success: true,
      statusCode: 201,
      data: { visibleInPortal: false, completed: false },
    });
  });

  it.each([
    {},
    { title: null },
    { title: '' },
    { title: '   ' },
    { title: 'x'.repeat(201) },
    { title: 'Tarefa', completed: true },
    { title: 'Tarefa', visibleInPortal: true },
    { title: 'Tarefa', position: 0 },
    { title: 'Tarefa', createdById: userId },
  ])('rejects invalid create payloads and unauthorized metadata', async (body) => {
    await request(server).post(route).set('Authorization', 'Bearer fixture').send(body).expect(400);

    expect(create).not.toHaveBeenCalled();
  });

  it('accepts item updates with the item version and accepts reorder as a distinct static route', async () => {
    await request(server)
      .patch(`${route}/${itemId}`)
      .set('Authorization', 'Bearer fixture')
      .send({ version: 1, completed: true })
      .expect(200);

    expect(update).toHaveBeenCalledWith(
      {
        organizationId,
        workOrderId,
        userId,
        itemId,
        version: 1
      },
      { version: 1, completed: true },
    );

    const body = { items: [{ id: itemId, version: 1 }] };

    const response = await request(server)
      .patch(`${route}/reorder`)
      .set('Authorization', 'Bearer fixture')
      .send(body)
      .expect(200);

    expect(reorder).toHaveBeenCalledWith({ organizationId, workOrderId, userId }, body);
    expect(update).toHaveBeenCalledOnce();
    expect(response.body).toMatchObject({ data: { progress: { total: 1, completed: 0 } } });
  });

  it.each([
    { completed: true },
    { version: 0, completed: true },
    { version: 1.5, completed: true },
    { version: 2147483648, completed: true },
    { version: '1', completed: true },
    { version: 1, completed: null },
    { version: 1, completed: 'true' },
    { version: 1, title: null },
    { version: 1, title: '   ' },
    { version: 1, visibleInPortal: null },
    { version: 1, completedById: userId },
    { version: 1, completedAt: new Date().toISOString() },
  ])('rejects malformed updates and caller-supplied completion audit fields', async (body) => {
    await request(server).patch(`${route}/${itemId}`).set('Authorization', 'Bearer fixture').send(body).expect(400);

    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { items: null },
    { items: 'invalid' },
    { items: [null] },
    { items: [[]] },
    { items: [{ id: 'invalid', version: 1 }] },
    { items: [{ id: itemId }] },
    { items: [{ id: itemId, version: 0 }] },
    { items: [{ id: itemId, version: '1' }] },
    { items: [{ id: itemId, version: null }] },
    { items: [{ id: itemId, version: 1, completed: true }] },
    { items: Array.from({ length: 51 }, () => ({ id: itemId, version: 1 })) },
  ])('validates nested reorder items before invoking the use case', async (body) => {
    await request(server).patch(`${route}/reorder`).set('Authorization', 'Bearer fixture').send(body).expect(400);

    expect(reorder).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('deletes by item version and returns an empty 204 response', async () => {
    const response = await request(server)
      .delete(`${route}/${itemId}`)
      .set('Authorization', 'Bearer fixture')
      .send({ version: 1 })
      .expect(204);

    expect(response.text).toBe('');
    expect(remove).toHaveBeenCalledWith({
      organizationId,
      workOrderId,
      userId,
      itemId,
      version: 1
    });

    await request(server).delete(`${route}/${itemId}`).set('Authorization', 'Bearer fixture').send({}).expect(400);

    expect(remove).toHaveBeenCalledOnce();
  });

  it.each([
    ['WORK_ORDER_CHECKLIST_ITEM_NOT_FOUND', 404],
    ['INVALID_WORK_ORDER_CHECKLIST_INPUT', 400],
    ['WORK_ORDER_CHECKLIST_LIMIT_REACHED', 409],
    ['WORK_ORDER_CHECKLIST_VERSION_CONFLICT', 409],
  ] as const)('maps %s to its status and standard error response', async (code, status) => {
    update.mockRejectedValueOnce(new WorkOrderChecklistError(code));

    const response = await request(server)
      .patch(`${route}/${itemId}`)
      .set('Authorization', 'Bearer fixture')
      .send({ version: 1, completed: true })
      .expect(status);

    expect(response.body).toMatchObject({ success: false, statusCode: status, error: { code } });
  });

  it('requires authentication on reads and mutations and rejects malformed scope identifiers', async () => {
    await request(server).get(route).expect(401);
    await request(server).post(route).send({ title: 'Tarefa' }).expect(401);
    await request(server).patch(`${route}/${itemId}`).send({ version: 1, completed: true }).expect(401);
    await request(server).delete(`${route}/${itemId}`).send({ version: 1 }).expect(401);
    await request(server).patch(`${route}/reorder`).send({ items: [] }).expect(401);
    await request(server)
      .get(route.replace(organizationId, 'invalid'))
      .set('Authorization', 'Bearer fixture')
      .expect(400);
    await request(server).get(route.replace(workOrderId, 'invalid')).set('Authorization', 'Bearer fixture').expect(400);

    expect(list).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(reorder).not.toHaveBeenCalled();
  });
});
