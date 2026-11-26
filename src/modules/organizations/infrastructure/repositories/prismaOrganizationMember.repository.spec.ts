import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaOrganizationMemberRepository } from './prismaOrganizationMember.repository.js';

const organizationId = 'organization';
const userId = 'user';
const memberId = 'member';

function fixture() {
  const count = vi.fn().mockResolvedValue(0);
  const findFirst = vi.fn().mockResolvedValue(null);
  const findMany = vi.fn().mockResolvedValue([]);
  const create = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(undefined);
  const repository = new PrismaOrganizationMemberRepository({
    organizationMember: { count, findFirst, findMany, create, delete: remove },
  } as unknown as Prisma.TransactionClient);

  return { repository, count, findFirst, findMany, create, remove };
}

describe('PrismaOrganizationMemberRepository', () => {
  it('scopes member identity and count to the requested organization', async () => {
    const f = fixture();

    await f.repository.count(organizationId);
    await f.repository.findByUser({ organizationId, userId });
    await f.repository.findById({ organizationId, memberId });

    expect(f.count).toHaveBeenCalledWith({ where: { organizationId } });
    expect(f.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { organizationId, userId },
    }));
    expect(f.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { organizationId, id: memberId },
    }));
  });

  it('checks membership by email only within the selected tenant', async () => {
    const f = fixture();
    const email = 'member@example.invalid';
    f.count.mockResolvedValueOnce(1);

    expect(await f.repository.existsByEmail({ organizationId, email })).toBe(true);
    expect(await f.repository.existsByEmail({ organizationId, email })).toBe(false);
    expect(f.count).toHaveBeenCalledWith({ where: { organizationId, user: { email } } });
  });

  it('creates ordinary membership and scopes removals without accepting an arbitrary role', async () => {
    const f = fixture();

    await f.repository.add({ organizationId, userId });
    await f.repository.remove({ organizationId, memberId });

    expect(f.create).toHaveBeenCalledWith({ data: { organizationId, userId, role: 'MEMBER' } });
    expect(f.remove).toHaveBeenCalledWith({ where: { id: memberId, organizationId } });
  });

  it('paginates members in deterministic order without selecting email or credentials', async () => {
    const f = fixture();
    const member = { id: memberId, userId, role: 'MEMBER', user: { name: 'Fixture' } };
    f.findMany.mockResolvedValueOnce([member, { ...member, id: 'next' }]);

    expect(await f.repository.list({ organizationId, page: 2, limit: 1 })).toEqual({
      items: [member], page: 2, hasMore: true,
    });
    expect(f.findMany).toHaveBeenCalledWith({
      where: { organizationId },
      select: { id: true, userId: true, role: true, createdAt: true, user: { select: { name: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: 1,
      take: 2,
    });
  });

  it('lists joined organizations using membership roles instead of owner identity', async () => {
    const f = fixture();
    f.findMany.mockResolvedValueOnce([
      { role: 'MEMBER', organization: { id: organizationId, name: 'Fixture', logoKey: null } },
    ]);

    expect(await f.repository.listJoined({ userId, page: 1, limit: 10 })).toEqual({
      items: [{ id: organizationId, name: 'Fixture', logoKey: null, role: 'MEMBER' }],
      page: 1, hasMore: false,
    });
    expect(f.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId }, skip: 0, take: 11,
    }));
  });
});
