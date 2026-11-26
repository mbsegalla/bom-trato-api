import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

import { PrismaPublicQuoteUnitOfWork } from './prismaPublicQuoteUnitOfWork.js';

function fixture() {
  const source = vi.fn().mockResolvedValue({ organizationId: 'org' });
  const organization = vi
    .fn()
    .mockResolvedValue({ id: 'org', subscriptions: [], trial: null, name: 'Fixture', ownerId: 'owner' });
  const members = vi.fn().mockResolvedValue([]);
  const customer = vi.fn().mockResolvedValue(null);
  const query = vi.fn().mockResolvedValue([{ id: 'org' }]);
  const db = {
    organization: { findUnique: organization },
    organizationMember: { findMany: members },
    customer: { findFirst: customer },
    $queryRaw: query,
    $executeRaw: vi.fn().mockResolvedValue(0),
  };
  const transaction = vi.fn(async (operation: (client: typeof db) => Promise<unknown>) => operation(db));
  const unit = new PrismaPublicQuoteUnitOfWork({
    quoteShare: { findUnique: source },
    $transaction: transaction,
  } as unknown as PrismaService);
  return { unit, source, organization, members, customer, query, transaction };
}

describe('PrismaPublicQuoteUnitOfWork', () => {
  it.each(['read', 'run'] as const)('rejects unknown shares before a %s transaction', async (mode) => {
    const f = fixture();
    f.source.mockResolvedValue(null);
    await expect(f.unit[mode]('missing', vi.fn())).rejects.toThrow('QUOTE_SHARE_NOT_FOUND');
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it('uses the share-derived organization and resolves current access', async () => {
    const f = fixture();
    expect(await f.unit.read('hash', async (tx) => tx.access)).toMatchObject({ hasAccess: false, source: 'NONE' });
    expect(f.source).toHaveBeenCalledWith({ where: { tokenHash: 'hash' }, select: { organizationId: true } });
    expect(f.organization).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'org' } }));
  });

  it('rejects missing organizations for both read and write', async () => {
    const f = fixture();
    f.organization.mockResolvedValue(null);
    f.query.mockResolvedValue([]);
    await expect(f.unit.read('hash', vi.fn())).rejects.toThrow('QUOTE_SHARE_NOT_FOUND');
    await expect(f.unit.run('hash', vi.fn())).rejects.toThrow('QUOTE_SHARE_NOT_FOUND');
  });

  it.each([{ members: [] }, { members: [{ userId: 'one' }] }, { members: [{ userId: 'one' }, { userId: 'two' }] }])(
    'assigns only a single eligible member',
    async ({ members }) => {
      const f = fixture();
      f.members.mockResolvedValue(members);
      expect(await f.unit.run('hash', (tx) => tx.findSingleAssignableMember())).toBe(
        members.length === 1 ? 'one' : null,
      );
      expect(f.members).toHaveBeenCalledWith({
        where: { organizationId: 'org', user: { disabledAt: null, emailVerifiedAt: { not: null } } },
        select: { userId: true },
        take: 2,
      });
    },
  );

  it.each([null, { defaultServiceAddress: null }, { defaultServiceAddress: 'Address' }])(
    'scopes the customer address to the share organization',
    async (customer) => {
      const f = fixture();
      f.customer.mockResolvedValue(customer);
      expect(await f.unit.run('hash', (tx) => tx.findCustomerDefaultServiceAddress('customer'))).toBe(
        customer?.defaultServiceAddress ?? null,
      );
      expect(f.customer).toHaveBeenCalledWith({
        where: { id: 'customer', organizationId: 'org' },
        select: { defaultServiceAddress: true },
      });
    },
  );

  it('reads the organization identity from the share scope', async () => {
    const f = fixture();
    await f.unit.read('hash', (tx) => tx.findOrganization());
    expect(f.organization).toHaveBeenLastCalledWith({ where: { id: 'org' }, select: { name: true, ownerId: true } });
  });
});
