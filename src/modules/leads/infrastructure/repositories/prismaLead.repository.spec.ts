import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { Lead } from '../../domain/entities/lead.entity.js';
import { PrismaLeadRepository } from './prismaLead.repository.js';

const now = new Date('2026-01-01T00:00:00Z');
const organizationId = 'org';
const lead = Lead.create({
  id: 'lead',
  requestKey: 'request',
  organizationId,
  publicBusinessProfileId: 'profile',
  catalogServiceId: null,
  requestedServiceName: null,
  name: 'Fixture customer',
  email: 'customer@example.invalid',
  message: 'Fixture service request',
}, now);
const state = lead.snapshot();

function fixture() {
  const createMany = vi.fn().mockResolvedValue({ count: 1 });
  const findUnique = vi.fn().mockResolvedValue(state);
  const findFirst = vi.fn().mockResolvedValue(null);
  const findMany = vi.fn().mockResolvedValue([]);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const repository = new PrismaLeadRepository({
    lead: { createMany, findUnique, findFirst, findMany, updateMany },
  } as unknown as Prisma.TransactionClient, organizationId);

  return { repository, createMany, findUnique, findFirst, findMany, updateMany };
}

describe('PrismaLeadRepository', () => {
  it('returns the persisted request and reports whether the insert was new', async () => {
    const f = fixture();

    expect(await f.repository.create(lead)).toEqual({ lead: state, created: true });
    f.createMany.mockResolvedValueOnce({ count: 0 });
    expect(await f.repository.create(lead)).toEqual({ lead: state, created: false });

    expect(f.createMany).toHaveBeenCalledWith({ data: [state], skipDuplicates: true });
    expect(f.findUnique).toHaveBeenCalledWith({ where: { requestKey: state.requestKey } });
  });

  it.each([null, { ...state, organizationId: 'foreign' }])(
    'rejects an unavailable or foreign idempotency record: %j',
    async (value) => {
      const f = fixture();
      f.findUnique.mockResolvedValueOnce(value);

      await expect(f.repository.create(lead)).rejects.toThrow('LEAD_REQUEST_CONFLICT');
    },
  );

  it('rejects foreign aggregates before creating or updating them', async () => {
    const f = fixture();
    const foreign = Lead.restore({ ...state, organizationId: 'foreign' });

    await expect(f.repository.create(foreign)).rejects.toThrow('LEAD_NOT_FOUND');
    await expect(f.repository.save(foreign)).rejects.toThrow('LEAD_NOT_FOUND');

    expect(f.createMany).not.toHaveBeenCalled();
    expect(f.updateMany).not.toHaveBeenCalled();
  });

  it('scopes reads and combines the search, status and page filters', async () => {
    const f = fixture();
    const term = 'Fixture';
    const insensitive = { contains: term, mode: 'insensitive' };
    f.findMany.mockResolvedValueOnce([state, { ...state, id: 'next' }]);

    await f.repository.findById(state.id);
    expect(await f.repository.list({ page: 2, limit: 1, status: 'NEW', search: '  Fixture  ' }))
      .toEqual({ items: [state], page: 2, hasMore: true });

    expect(f.findFirst).toHaveBeenCalledWith({ where: { id: state.id, organizationId } });
    expect(f.findMany).toHaveBeenCalledWith({
      where: {
        organizationId,
        status: 'NEW',
        OR: [
          { name: insensitive },
          { email: insensitive },
          { phone: { contains: term } },
          { requestedServiceName: insensitive },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 1,
      take: 2,
    });
  });

  it('persists conversion references and timestamps without overwriting original contact data', async () => {
    const f = fixture();
    const converted = Lead.restore(state);
    converted.convert('customer', 'quote', now);

    await f.repository.save(converted);

    expect(f.updateMany).toHaveBeenCalledWith({
      where: { id: state.id, organizationId },
      data: {
        status: 'CONVERTED',
        convertedCustomerId: 'customer',
        convertedQuoteId: 'quote',
        contactedAt: null,
        convertedAt: now,
        archivedAt: null,
        updatedAt: now,
      },
    });
  });

  it('reports a missing row instead of assuming a write succeeded', async () => {
    const f = fixture();
    f.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(f.repository.save(lead)).rejects.toThrow('LEAD_NOT_FOUND');
  });
});
