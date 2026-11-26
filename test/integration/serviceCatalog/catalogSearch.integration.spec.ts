import { expect, it } from 'vitest';

import { ServiceCatalogApplicationService } from '../../../src/modules/serviceCatalog/application/services/serviceCatalogApplicationService.service.js';
import { CreateCatalogServiceUseCase } from '../../../src/modules/serviceCatalog/application/useCases/createCatalogService.useCase.js';
import { ListCatalogServicesUseCase } from '../../../src/modules/serviceCatalog/application/useCases/listCatalogServices.useCase.js';
import { ArchiveCatalogServiceUseCase } from '../../../src/modules/serviceCatalog/application/useCases/archiveCatalogService.useCase.js';
import { PrismaCatalogServiceUnitOfWork } from '../../../src/modules/serviceCatalog/infrastructure/transactions/prismaCatalogServiceUnitOfWork.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';

databaseSuite('catalog search and pagination (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  async function tenant() {
    const actor = await db.tenant();

    db.cleanup(() => db.prisma.catalogService.deleteMany({ where: { organizationId: actor.organizationId } }));

    return actor;
  }

  it('searches name and description case-insensitively while escaping SQL wildcard characters', async () => {
    const actor = await tenant();
    const other = await tenant();
    const service = new ServiceCatalogApplicationService(new PrismaCatalogServiceUnitOfWork(db.prisma));
    const create = new CreateCatalogServiceUseCase(service);
    const list = new ListCatalogServicesUseCase(service);
    const input = { unit: 'SERVICE' as const, amountInCents: 1234 };

    const percent = await create.execute(actor, { ...input, name: 'Discount 100% fixture' });
    const underscore = await create.execute(actor, { ...input, name: 'Other fixture', description: 'Code A_B' });

    await create.execute(actor, { ...input, name: 'Discount 100X fixture', description: 'Code ACB' });
    await create.execute(other, { ...input, name: 'Discount 100% fixture' });

    const params = { page: 1, limit: 10, status: 'ALL' as const };

    expect((await list.execute(actor, { ...params, search: '100%' })).items.map((item) => item.id)).toEqual([percent.id]);
    expect((await list.execute(actor, { ...params, search: 'a_b' })).items.map((item) => item.id)).toEqual([underscore.id]);
  });

  it('paginates within the status filter and does not leak archived services into active pages', async () => {
    const actor = await tenant();
    const service = new ServiceCatalogApplicationService(new PrismaCatalogServiceUnitOfWork(db.prisma));
    const create = new CreateCatalogServiceUseCase(service);
    const list = new ListCatalogServicesUseCase(service);

    const rows = [];
    for (let index = 0; index < 3; index++) {
      rows.push(await create.execute(actor, { name: 'Fixture service ' + index, unit: 'SERVICE', amountInCents: 1000 }));
    }

    const archived = rows[0]!;
    await new ArchiveCatalogServiceUseCase(service).execute({ ...actor, serviceId: archived.id });

    const first = await list.execute(actor, { page: 1, limit: 1, status: 'ACTIVE' });
    const second = await list.execute(actor, { page: 2, limit: 1, status: 'ACTIVE' });
    const archivedPage = await list.execute(actor, { page: 1, limit: 10, status: 'ARCHIVED' });

    expect(first).toMatchObject({ page: 1, hasMore: true });
    expect(second).toMatchObject({ page: 2, hasMore: false });
    expect([...first.items, ...second.items].map((item) => item.id).sort()).toEqual(rows.slice(1).map((item) => item.id).sort());
    expect(archivedPage.items.map((item) => item.id)).toEqual([archived.id]);
  });
});
