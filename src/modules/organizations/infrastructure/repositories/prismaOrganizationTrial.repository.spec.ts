import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaOrganizationTrialRepository } from './prismaOrganizationTrial.repository.js';

const state = {
  id: 'trial',
  organizationId: 'org',
  ownerId: 'owner',
  startsAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: new Date('2026-01-08T00:00:00Z'),
  convertedAt: null,
  revokedAt: null,
};

describe('PrismaOrganizationTrialRepository', () => {
  it('looks up trial eligibility separately by organization and owner', async () => {
    const findUnique = vi.fn().mockResolvedValueOnce(state).mockResolvedValueOnce(null);
    const repository = new PrismaOrganizationTrialRepository({
      organizationTrial: { findUnique },
    } as unknown as Prisma.TransactionClient);

    expect(await repository.findByOrganizationId(state.organizationId)).toEqual(state);
    expect(await repository.findByOwnerId(state.ownerId)).toBeNull();
    expect(findUnique).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { organizationId: state.organizationId } }));
    expect(findUnique).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { ownerId: state.ownerId } }));
  });

  it('persists the original trial period and owner without silently extending access', async () => {
    const create = vi.fn().mockResolvedValue(state);
    const repository = new PrismaOrganizationTrialRepository({
      organizationTrial: { create },
    } as unknown as Prisma.TransactionClient);

    expect(await repository.create(state)).toEqual(state);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: state }));
  });
});
