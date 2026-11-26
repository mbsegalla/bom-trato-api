import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ArchiveCatalogServiceUseCase } from '../../../src/modules/serviceCatalog/application/useCases/archiveCatalogService.useCase.js';
import { CreateCatalogServiceUseCase } from '../../../src/modules/serviceCatalog/application/useCases/createCatalogService.useCase.js';
import { GetCatalogServiceUseCase } from '../../../src/modules/serviceCatalog/application/useCases/getCatalogService.useCase.js';
import { ListCatalogServicesUseCase } from '../../../src/modules/serviceCatalog/application/useCases/listCatalogServices.useCase.js';
import { RestoreCatalogServiceUseCase } from '../../../src/modules/serviceCatalog/application/useCases/restoreCatalogService.useCase.js';
import { UpdateCatalogServiceUseCase } from '../../../src/modules/serviceCatalog/application/useCases/updateCatalogService.useCase.js';
import { CatalogServiceError } from '../../../src/modules/serviceCatalog/domain/errors/catalogService.error.js';
import { CatalogServicesController } from '../../../src/modules/serviceCatalog/presentation/http/controllers/catalogServices.controller.js';
import { createHttpFixture, itemId, organizationId, userId } from '../support/http.fixture.js';

const route = '/api/organizations/' + organizationId + '/services';
const input = {
  name: 'Fixture service',
  unit: 'SERVICE' as const,
  amountInCents: 1234,
};
const row = {
  ...input,
  id: itemId,
  organizationId,
  description: null,
  estimatedDurationMinutes: null,
  currency: 'brl',
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('catalog HTTP routes', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const create = vi.fn<CreateCatalogServiceUseCase['execute']>();
  const get = vi.fn<GetCatalogServiceUseCase['execute']>();
  const list = vi.fn<ListCatalogServicesUseCase['execute']>();

  beforeAll(async () => {
    fixture = await createHttpFixture(
      [CatalogServicesController],
      [
        { provide: CreateCatalogServiceUseCase, useValue: { execute: create } },
        { provide: GetCatalogServiceUseCase, useValue: { execute: get } },
        { provide: ListCatalogServicesUseCase, useValue: { execute: list } },
        ...[UpdateCatalogServiceUseCase, ArchiveCatalogServiceUseCase, RestoreCatalogServiceUseCase].map((provide) => ({
          provide,
          useValue: { execute: vi.fn() },
        })),
      ],
    );
  });

  beforeEach(() => {
    create.mockReset().mockResolvedValue(row);
    get.mockReset().mockResolvedValue(row);
    list.mockReset().mockResolvedValue({
      items: [],
      page: 1,
      hasMore: false,
    });
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('rejects invalid cents, spoofed actor fields and missing authentication', async () => {
    await request(fixture.server).post(route).send(input).expect(401);
    for (const body of [
      { ...input, amountInCents: -1 },
      { ...input, amountInCents: 1.5 },
      { ...input, organizationId: itemId },
      { ...input, userId: itemId },
    ]) {
      await request(fixture.server).post(route).set('Authorization', 'Bearer fixture').send(body).expect(400);
    }
    expect(create).not.toHaveBeenCalled();

    await request(fixture.server)
      .post(route)
      .set('Authorization', 'Bearer fixture')
      .send({
        ...input,
        name: ' Fixture service ',
      })
      .expect(201);

    expect(create).toHaveBeenCalledWith({ organizationId, userId }, expect.objectContaining(input));
  });

  it('validates pagination and scopes service lookup errors', async () => {
    await request(fixture.server)
      .get(route + '?page=0')
      .set('Authorization', 'Bearer fixture')
      .expect(400);
    await request(fixture.server)
      .get(route + '?status=INVALID')
      .set('Authorization', 'Bearer fixture')
      .expect(400);

    expect(list).not.toHaveBeenCalled();

    get.mockRejectedValueOnce(new CatalogServiceError('MEMBER_REQUIRED'));

    await request(fixture.server)
      .get(route + '/' + itemId)
      .set('Authorization', 'Bearer fixture')
      .expect(403);
    get.mockRejectedValueOnce(new CatalogServiceError('CATALOG_SERVICE_NOT_FOUND'));

    await request(fixture.server)
      .get(route + '/' + itemId)
      .set('Authorization', 'Bearer fixture')
      .expect(404);

    expect(get).toHaveBeenCalledWith({ organizationId, userId, serviceId: itemId });
  });
});
