import { describe, expect, it, vi } from 'vitest';

import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { CatalogService } from '../../domain/entities/catalogService.entity.js';
import type { CatalogServiceRepository } from '../../domain/repositories/catalogService.repository.js';
import type { CatalogServiceTransaction, CatalogServiceUnitOfWork } from '../ports/catalogServiceUnitOfWork.port.js';
import { ServiceCatalogApplicationService } from '../services/serviceCatalogApplicationService.service.js';
import { CreateCatalogServiceUseCase } from './createCatalogService.useCase.js';
import { UpdateCatalogServiceUseCase } from './updateCatalogService.useCase.js';
import { ArchiveCatalogServiceUseCase } from './archiveCatalogService.useCase.js';
import { RestoreCatalogServiceUseCase } from './restoreCatalogService.useCase.js';
import { ListCatalogServicesUseCase } from './listCatalogServices.useCase.js';
import { GetCatalogServiceUseCase } from './getCatalogService.useCase.js';

const actor = { organizationId: 'org', userId: 'owner' };
const params = { ...actor, serviceId: 'service' };
const data = { name: ' Service ', unit: 'SERVICE' as const, amountInCents: 1000 };
const access: OrganizationAccessContext = { isMember: true, verified: true, hasPlatformAccess: true, source: 'TRIAL', billingNeedsReconciliation: false };
function fixture(permissions = access) {
  let saved = CatalogService.create({ ...data, id: 'service', organizationId: 'org' }, new Date()).snapshot();
  const catalogServices = {
    findById: vi.fn<CatalogServiceRepository['findById']>().mockImplementation(async () => saved),
    create: vi.fn<CatalogServiceRepository['create']>().mockResolvedValue(undefined),
    save: vi.fn<CatalogServiceRepository['save']>().mockImplementation(async (entity) => { saved = entity.snapshot(); }),
    list: vi.fn<CatalogServiceRepository['list']>().mockResolvedValue({ page: 1, hasMore: false, items: [] }),
  };
  const tx: CatalogServiceTransaction = { access: permissions, catalogServices };
  const run = vi.fn(async (_actor: typeof actor, operation: (context: CatalogServiceTransaction) => Promise<unknown>) => operation(tx));
  return { catalogServices, service: new ServiceCatalogApplicationService({ run, read: run } as unknown as CatalogServiceUnitOfWork) };
}
describe('catalog lifecycle use cases', () => {
  it('creates normalized integer-price services and never persists invalid values', async () => {
    const f = fixture();
    const create = new CreateCatalogServiceUseCase(f.service);
    expect(await create.execute(actor, data)).toMatchObject({ name: 'Service', organizationId: 'org', amountInCents: 1000, currency: 'brl' });
    await expect(create.execute(actor, { ...data, amountInCents: -1 })).rejects.toThrow('INVALID_CATALOG_SERVICE_AMOUNT');
    expect(f.catalogServices.create).toHaveBeenCalledTimes(1);
  });
  it('archives, blocks edits until restore, and saves only valid scoped updates', async () => {
    const f = fixture();
    expect(await new ArchiveCatalogServiceUseCase(f.service).execute(params)).toMatchObject({ archivedAt: expect.any(Date) });
    await expect(new UpdateCatalogServiceUseCase(f.service).execute(params, { amountInCents: 2000 })).rejects.toThrow('CATALOG_SERVICE_ARCHIVED');
    await new RestoreCatalogServiceUseCase(f.service).execute(params);
    expect(await new UpdateCatalogServiceUseCase(f.service).execute(params, { amountInCents: 2000 })).toMatchObject({ archivedAt: null, amountInCents: 2000 });
    expect(f.catalogServices.save).toHaveBeenCalledTimes(3);
  });
  it('protects reads and mutations before calling scoped repositories', async () => {
    const f = fixture({ ...access, isMember: false });
    await expect(new GetCatalogServiceUseCase(f.service).execute(params)).rejects.toThrow('MEMBER_REQUIRED');
    await expect(new ListCatalogServicesUseCase(f.service).execute(actor, { page: 1, limit: 10, status: 'ACTIVE' })).rejects.toThrow('MEMBER_REQUIRED');
    await expect(new CreateCatalogServiceUseCase(f.service).execute(actor, data)).rejects.toThrow('MEMBER_REQUIRED');
    expect(f.catalogServices.findById).not.toHaveBeenCalled();
    expect(f.catalogServices.list).not.toHaveBeenCalled();
    expect(f.catalogServices.create).not.toHaveBeenCalled();
  });
});
