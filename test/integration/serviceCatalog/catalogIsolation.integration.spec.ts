import { expect, it } from 'vitest';

import { ServiceCatalogApplicationService } from '../../../src/modules/serviceCatalog/application/services/serviceCatalogApplicationService.service.js';
import { CreateCatalogServiceUseCase } from '../../../src/modules/serviceCatalog/application/useCases/createCatalogService.useCase.js';
import { GetCatalogServiceUseCase } from '../../../src/modules/serviceCatalog/application/useCases/getCatalogService.useCase.js';
import { ListCatalogServicesUseCase } from '../../../src/modules/serviceCatalog/application/useCases/listCatalogServices.useCase.js';
import { UpdateCatalogServiceUseCase } from '../../../src/modules/serviceCatalog/application/useCases/updateCatalogService.useCase.js';
import { ArchiveCatalogServiceUseCase } from '../../../src/modules/serviceCatalog/application/useCases/archiveCatalogService.useCase.js';
import { RestoreCatalogServiceUseCase } from '../../../src/modules/serviceCatalog/application/useCases/restoreCatalogService.useCase.js';
import { PrismaCatalogServiceUnitOfWork } from '../../../src/modules/serviceCatalog/infrastructure/transactions/prismaCatalogServiceUnitOfWork.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';

databaseSuite('catalog isolation (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();
  const input = { name: 'Fixture service', unit: 'SERVICE' as const, amountInCents: 1234 };
  async function tenant() {
    const actor = await db.tenant();
    db.cleanup(() => db.prisma.catalogService.deleteMany({ where: { organizationId: actor.organizationId } }));
    return actor;
  }

  it('isolates catalog reads and edits by organization and rejects a nonmember', async () => {
    const first = await tenant();
    const second = await tenant();
    const service = new ServiceCatalogApplicationService(new PrismaCatalogServiceUnitOfWork(db.prisma));
    const a = await new CreateCatalogServiceUseCase(service).execute(first, input);
    const b = await new CreateCatalogServiceUseCase(service).execute(second, input);
    await expect(new GetCatalogServiceUseCase(service).execute({ ...second, serviceId: a.id })).rejects.toThrow('CATALOG_SERVICE_NOT_FOUND');
    await expect(new UpdateCatalogServiceUseCase(service).execute({ ...second, serviceId: a.id }, { amountInCents: 1 })).rejects.toThrow('CATALOG_SERVICE_NOT_FOUND');
    await expect(new GetCatalogServiceUseCase(service).execute({ ...first, userId: second.userId, serviceId: a.id })).rejects.toThrow('MEMBER_REQUIRED');
    const page = await new ListCatalogServicesUseCase(service).execute(second, { page: 1, limit: 10, status: 'ACTIVE' });
    expect(page.items.map((item) => item.id)).toEqual([b.id]);
    expect((await new GetCatalogServiceUseCase(service).execute({ ...first, serviceId: a.id })).amountInCents).toBe(1234);
  });

  it('persists archival and restoration without changing financial units', async () => {
    const actor = await tenant();
    const service = new ServiceCatalogApplicationService(new PrismaCatalogServiceUnitOfWork(db.prisma));
    const row = await new CreateCatalogServiceUseCase(service).execute(actor, input);
    const params = { ...actor, serviceId: row.id };
    await new ArchiveCatalogServiceUseCase(service).execute(params);
    await expect(new UpdateCatalogServiceUseCase(service).execute(params, { amountInCents: 2000 })).rejects.toThrow('CATALOG_SERVICE_ARCHIVED');
    const list = new ListCatalogServicesUseCase(service);
    expect((await list.execute(actor, { page: 1, limit: 10, status: 'ACTIVE' })).items).toHaveLength(0);
    expect((await list.execute(actor, { page: 1, limit: 10, status: 'ARCHIVED' })).items.map((item) => item.id)).toEqual([row.id]);
    await new RestoreCatalogServiceUseCase(service).execute(params);
    expect(await new UpdateCatalogServiceUseCase(service).execute(params, { amountInCents: 2000 })).toMatchObject({ archivedAt: null, amountInCents: 2000, currency: 'brl' });
  });
});
