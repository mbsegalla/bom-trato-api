import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { CatalogService } from '../../domain/entities/catalogService.entity.js';
import { PrismaCatalogServiceRepository } from './prismaCatalogService.repository.js';

const now = new Date('2026-01-01T00:00:00Z');
const organizationId = 'org';
const service = CatalogService.create({
  id: 'service',
  organizationId,
  name: 'Fixture service',
  unit: 'SERVICE',
  amountInCents: 12345,
  estimatedDurationMinutes: 90,
}, now);
const state = service.snapshot();

function fixture() {
  const create = vi.fn().mockResolvedValue(undefined);
  const findFirst = vi.fn().mockResolvedValue(null);
  const findMany = vi.fn().mockResolvedValue([]);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const repository = new PrismaCatalogServiceRepository({
    catalogService: { create, findFirst, findMany, updateMany },
  } as unknown as Prisma.TransactionClient, organizationId);

  return { repository, create, findFirst, findMany, updateMany };
}

describe('PrismaCatalogServiceRepository', () => {
  it('creates a normalized service and scopes reads by tenant', async () => {
    const f = fixture();
    f.findFirst.mockResolvedValueOnce(state);

    await f.repository.create(service);
    expect(await f.repository.findById(state.id)).toEqual(state);

    expect(f.create).toHaveBeenCalledWith({ data: state });
    expect(f.findFirst).toHaveBeenCalledWith({ where: { id: state.id, organizationId } });
  });

  it('rejects writes for a different organization before touching persistence', async () => {
    const f = fixture();
    const foreign = CatalogService.restore({ ...state, organizationId: 'other' });

    await expect(f.repository.create(foreign)).rejects.toThrow('CATALOG_SERVICE_NOT_FOUND');
    await expect(f.repository.save(foreign)).rejects.toThrow('CATALOG_SERVICE_NOT_FOUND');

    expect(f.create).not.toHaveBeenCalled();
    expect(f.updateMany).not.toHaveBeenCalled();
  });

  it('escapes literal wildcard search and preserves stable pagination', async () => {
    const f = fixture();
    const search = String.raw`100%_\test`;
    const filter = { contains: String.raw`100\%\_\\test`, mode: 'insensitive' };
    f.findMany.mockResolvedValueOnce([state, { ...state, id: 'next' }]);

    expect(await f.repository.list({ page: 2, limit: 1, status: 'ACTIVE', search }))
      .toEqual({ items: [state], page: 2, hasMore: true });

    expect(f.findMany).toHaveBeenCalledWith({
      where: {
        organizationId,
        archivedAt: null,
        OR: [{ name: filter }, { description: filter }],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 1,
      take: 2,
    });
  });

  it('distinguishes archived-only lists from unrestricted status', async () => {
    const f = fixture();

    await f.repository.list({ page: 1, limit: 10, status: 'ARCHIVED' });
    await f.repository.list({ page: 1, limit: 10, status: 'ALL' });

    expect(f.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { organizationId, archivedAt: { not: null } },
    }));
    expect(f.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { organizationId },
    }));
  });

  it('updates mutable catalog data while retaining original currency and tenant identity', async () => {
    const f = fixture();
    const changed = CatalogService.restore(state);
    changed.update({ amountInCents: 0, estimatedDurationMinutes: null }, now);
    changed.archive(now);

    await f.repository.save(changed);

    expect(f.updateMany).toHaveBeenCalledWith({
      where: { id: state.id, organizationId },
      data: {
        name: state.name,
        description: null,
        unit: 'SERVICE',
        amountInCents: 0,
        estimatedDurationMinutes: null,
        archivedAt: now,
        updatedAt: now,
      },
    });
  });

  it('rejects updates when the scoped record no longer exists', async () => {
    const f = fixture();
    f.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(f.repository.save(service)).rejects.toThrow('CATALOG_SERVICE_NOT_FOUND');
  });
});
