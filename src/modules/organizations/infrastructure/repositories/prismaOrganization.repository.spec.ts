import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../../../generated/prisma/client.js';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { Organization } from '../../domain/entities/organization.entity.js';

import { PrismaOrganizationRepository } from './prismaOrganization.repository.js';

const organization = Organization.create({ id: 'org', ownerId: 'owner', name: 'Fixture business' }).snapshot();
const input = { organization, creationKey: 'request', billingEmail: 'owner@example.invalid' };
const owner = { emailVerifiedAt: new Date('2026-01-01T00:00:00Z'), disabledAt: null };

function fixture() {
  const user = vi.fn().mockResolvedValue(owner);
  const find = vi.fn().mockResolvedValue(null);
  const create = vi.fn().mockResolvedValue(organization);
  const list = vi.fn().mockResolvedValue([]);
  const repository = new PrismaOrganizationRepository({
    user: { findUnique: user },
    organization: { findUnique: find, create, findMany: list },
  } as unknown as PrismaService);

  return { repository, user, find, create, list };
}

describe('PrismaOrganizationRepository', () => {
  it.each([null, { ...owner, emailVerifiedAt: null }, { ...owner, disabledAt: new Date() }])(
    'rejects unavailable or unverified owners before looking up creation keys: %j',
    async (value) => {
      const f = fixture();
      f.user.mockResolvedValueOnce(value);

      await expect(f.repository.create(input)).rejects.toThrow('VERIFIED_USER_REQUIRED');
      expect(f.find).not.toHaveBeenCalled();
      expect(f.create).not.toHaveBeenCalled();
    },
  );

  it('creates the owner membership and billing identity atomically with the organization', async () => {
    const f = fixture();

    expect(await f.repository.create(input)).toEqual(organization);
    expect(f.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          ...organization,
          creationKey: input.creationKey,
          setupCompletedAt: expect.any(Date),
          organizationMembers: { create: { userId: organization.ownerId, role: 'OWNER' } },
          billingCustomer: { create: { billingEmail: input.billingEmail, billingName: organization.name } },
        },
      }),
    );
  });

  it('reuses a matching creation key only for the same owner and normalized name', async () => {
    const f = fixture();
    f.find.mockResolvedValueOnce(organization).mockResolvedValueOnce({ ...organization, name: 'Different' });

    expect(await f.repository.create(input)).toEqual(organization);
    await expect(f.repository.create(input)).rejects.toThrow('IDEMPOTENCY_CONFLICT');

    expect(f.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId_creationKey: { ownerId: organization.ownerId, creationKey: input.creationKey } },
      }),
    );
    expect(f.create).not.toHaveBeenCalled();
  });

  it('recovers a concurrent unique-key creation without masking unrelated database failures', async () => {
    const f = fixture();
    const conflict = new Prisma.PrismaClientKnownRequestError('Fixture unique conflict', {
      code: 'P2002',
      clientVersion: 'fixture',
    });
    f.find.mockResolvedValueOnce(null).mockResolvedValueOnce(organization);
    f.create.mockRejectedValueOnce(conflict);

    expect(await f.repository.create(input)).toEqual(organization);

    const failure = new Error('Fixture connection failure');
    f.create.mockRejectedValueOnce(failure);

    await expect(f.repository.create(input)).rejects.toBe(failure);
  });

  it('lists only completed setups owned by the authenticated user', async () => {
    const f = fixture();
    f.list.mockResolvedValueOnce([organization]);

    expect(await f.repository.listOwned('owner')).toEqual([organization]);
    expect(f.list).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: 'owner', setupCompletedAt: { not: null } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 100,
      }),
    );
  });
});
