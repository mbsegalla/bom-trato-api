import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

import { PrismaLeadUnitOfWork } from './prismaLeadUnitOfWork.js';

const params = { organizationId: 'org', userId: 'owner' };
const profile = {
  id: 'profile',
  organizationId: 'org',
  organization: { name: 'Fixture', ownerId: 'owner', organizationMembers: [{ userId: 'owner' }, { userId: 'member' }] },
};

function fixture() {
  const source = vi.fn().mockResolvedValue({ organizationId: 'org' });
  const publicProfile = vi.fn().mockResolvedValue(profile);
  const organization = vi.fn().mockResolvedValue({
    id: 'org',
    subscriptions: [],
    trial: {
      id: 'trial',
      organizationId: 'org',
      ownerId: 'owner',
      startsAt: new Date(Date.now() - 60000),
      expiresAt: new Date(Date.now() + 60000),
      convertedAt: null,
      revokedAt: null,
    },
  });
  const member = vi.fn().mockResolvedValue(null);
  const customers = vi.fn().mockResolvedValue([]);
  const catalog = vi.fn().mockResolvedValue(null);
  const query = vi.fn().mockResolvedValue([{ id: 'org' }]);
  const db = {
    organization: { findUnique: organization },
    organizationMember: { findUnique: member },
    subscription: { findFirst: vi.fn().mockResolvedValue(null) },
    billingInvoice: { findFirst: vi.fn().mockResolvedValue(null) },
    publicBusinessProfile: { findUnique: source, findFirst: publicProfile },
    customer: { findMany: customers },
    catalogService: { findFirst: catalog },
    $queryRaw: query,
    $executeRaw: vi.fn().mockResolvedValue(0),
  };
  const transaction = vi.fn(async (operation: (client: typeof db) => Promise<unknown>) => operation(db));
  const unit = new PrismaLeadUnitOfWork({ ...db, $transaction: transaction } as unknown as PrismaService);

  return { unit, source, publicProfile, organization, member, customers, catalog, query, transaction };
}

describe('PrismaLeadUnitOfWork', () => {
  it('scopes private access to the requested organization and actor', async () => {
    const f = fixture();
    expect(await f.unit.read(params, async (tx) => tx.access)).toMatchObject({
      isMember: false,
      verified: false,
      hasPlatformAccess: false,
    });
    expect(f.member).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_userId: { organizationId: 'org', userId: 'owner' } },
      }),
    );
  });

  it.each([
    ['fixture@example.invalid', null, [{ email: 'fixture@example.invalid' }]],
    [null, '34999999999', [{ phone: '34999999999' }]],
    ['fixture@example.invalid', '34999999999', [{ email: 'fixture@example.invalid' }, { phone: '34999999999' }]],
  ] as const)(
    'scopes contact searches to the tenant and limits ambiguous matches',
    async (email, phone, conditions) => {
      const f = fixture();
      await f.unit.run(params, (tx) => tx.findCustomersByContact(email, phone));
      expect(f.customers).toHaveBeenCalledWith({ where: { organizationId: 'org', OR: conditions }, take: 2 });
    },
  );

  it('avoids unbounded searches without contact data', async () => {
    const f = fixture();
    expect(await f.unit.run(params, (tx) => tx.findCustomersByContact(null, null))).toEqual([]);
    expect(f.customers).not.toHaveBeenCalled();
  });

  it('restricts internal catalog lookup to active tenant services', async () => {
    const f = fixture();
    await f.unit.run(params, (tx) => tx.findCatalogService('service'));
    expect(f.catalog).toHaveBeenCalledWith({ where: { id: 'service', organizationId: 'org', archivedAt: null } });
  });

  it('rejects unknown public slugs before acquiring a transaction', async () => {
    const f = fixture();
    f.source.mockResolvedValue(null);
    await expect(f.unit.publicRun('missing', vi.fn())).rejects.toThrow('PUBLIC_PROFILE_NOT_FOUND');
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it('rejects a profile unpublished between lookup and transaction', async () => {
    const f = fixture();
    f.publicProfile.mockResolvedValue(null);
    const operation = vi.fn();
    await expect(f.unit.publicRun('slug', operation)).rejects.toThrow('PUBLIC_PROFILE_NOT_FOUND');
    expect(operation).not.toHaveBeenCalled();
  });

  it('rejects public lead creation when platform access is unavailable', async () => {
    const f = fixture();
    f.organization.mockResolvedValue({ id: 'org', subscriptions: [], trial: null });
    const operation = vi.fn();
    await expect(f.unit.publicRun('slug', operation)).rejects.toThrow('PUBLIC_PROFILE_NOT_FOUND');
    expect(operation).not.toHaveBeenCalled();
  });

  it('deduplicates recipients and restricts public catalog to selected services', async () => {
    const f = fixture();
    await f.unit.publicRun('slug', async (tx) => {
      expect(tx.organizationId).toBe('org');
      expect(tx.recipientUserIds).toEqual(['owner', 'member']);
      await tx.findPublicCatalogService('service');
    });
    expect(f.catalog).toHaveBeenCalledWith({
      where: {
        id: 'service',
        organizationId: 'org',
        archivedAt: null,
        publicProfileSelections: { some: { publicBusinessProfileId: 'profile' } },
      },
    });
    expect(f.publicProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          slug: 'slug',
          organizationId: 'org',
          published: true,
          organization: { setupCompletedAt: { not: null } },
        },
      }),
    );
  });

  it('rejects missing organizations in both private modes', async () => {
    const f = fixture();
    f.organization.mockResolvedValue(null);
    f.query.mockResolvedValue([]);
    await expect(f.unit.read(params, vi.fn())).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    await expect(f.unit.run(params, vi.fn())).rejects.toThrow('ORGANIZATION_NOT_FOUND');
  });
});
