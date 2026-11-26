import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { OrganizationInvitation } from '../../domain/entities/organizationInvitation.entity.js';

import { PrismaOrganizationInvitationRepository } from './prismaOrganizationInvitation.repository.js';

const now = new Date('2026-01-01T00:00:00Z');
const organizationId = 'org';
const invitationId = 'invitation';
const email = 'member@example.invalid';

function fixture() {
  const invitation = OrganizationInvitation.create({
    id: invitationId,
    organizationId,
    email,
    invitedById: 'owner',
    tokenHash: 'fixture-hash',
    now,
  });
  const findFirst = vi.fn().mockResolvedValue(null);
  const findUnique = vi.fn().mockResolvedValue(null);
  const findMany = vi.fn().mockResolvedValue([]);
  const create = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn().mockResolvedValue(undefined);
  const repository = new PrismaOrganizationInvitationRepository({
    organizationInvitation: { findFirst, findUnique, findMany, create, update },
  } as unknown as Prisma.TransactionClient);

  return { invitation, repository, findFirst, findUnique, findMany, create, update };
}

describe('PrismaOrganizationInvitationRepository', () => {
  it('scopes invitation reads and resolves tokens without returning their stored hash', async () => {
    const f = fixture();

    await f.repository.findById({ organizationId, invitationId });
    await f.repository.findPending({ organizationId, email });
    await f.repository.findByTokenHash('fixture-hash');

    expect(f.findFirst).toHaveBeenCalledWith({ where: { id: invitationId, organizationId } });
    expect(f.findUnique).toHaveBeenNthCalledWith(1, {
      where: { organizationId_pendingEmail: { organizationId, pendingEmail: email } },
    });
    expect(f.findUnique).toHaveBeenNthCalledWith(2, {
      where: { tokenHash: 'fixture-hash' },
      select: { id: true, organizationId: true },
    });
  });

  it('releases the unique pending email identity after acceptance or revocation', async () => {
    const f = fixture();

    await f.repository.create(f.invitation);

    expect(f.create).toHaveBeenCalledWith({ data: { ...f.invitation.snapshot(), pendingEmail: email } });

    f.invitation.accept('member', now);
    await f.repository.save(f.invitation);

    expect(f.update).toHaveBeenCalledWith({
      where: { id: invitationId, organizationId },
      data: { ...f.invitation.snapshot(), pendingEmail: null },
    });

    const other = fixture();
    other.invitation.revoke(now);
    await other.repository.save(other.invitation);

    expect(other.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REVOKED', pendingEmail: null }),
      }),
    );
  });

  it('rotates only accepted tokens for the removed member in the selected organization', async () => {
    const f = fixture();
    f.findMany.mockResolvedValueOnce([{ id: 'first' }, { id: 'second' }]);

    await f.repository.invalidateAcceptedTokens({ organizationId, userId: 'member' });

    expect(f.findMany).toHaveBeenCalledWith({
      where: { organizationId, acceptedById: 'member', status: 'ACCEPTED' },
      select: { id: true },
    });
    for (const id of ['first', 'second']) {
      expect(f.update).toHaveBeenCalledWith({
        where: { id, organizationId },
        data: { tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
      });
    }
    expect(f.update.mock.calls[0][0].data.tokenHash).not.toBe(f.update.mock.calls[1][0].data.tokenHash);
  });

  it('includes only unexpired pending invitations and combines stored and effective expiry', async () => {
    const f = fixture();

    await f.repository.list({ organizationId, status: 'PENDING', page: 1, limit: 10, now });
    await f.repository.list({ organizationId, status: 'EXPIRED', page: 2, limit: 10, now });
    await f.repository.list({ organizationId, status: 'ACCEPTED', page: 1, limit: 10, now });

    expect(f.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { organizationId, status: 'PENDING', expiresAt: { gt: now } },
      }),
    );
    expect(f.findMany).toHaveBeenNthCalledWith(2, {
      where: { organizationId, OR: [{ status: 'EXPIRED' }, { status: 'PENDING', expiresAt: { lte: now } }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 11,
    });
    expect(f.findMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: { organizationId, status: 'ACCEPTED' },
      }),
    );
  });

  it('paginates all invitations when no status is supplied', async () => {
    const f = fixture();
    const state = f.invitation.snapshot();
    f.findMany.mockResolvedValueOnce([state, { ...state, id: 'next' }]);

    expect(await f.repository.list({ organizationId, page: 1, limit: 1, now })).toEqual({
      items: [state],
      page: 1,
      hasMore: true,
    });
    expect(f.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId }, take: 2 }));
  });
});
