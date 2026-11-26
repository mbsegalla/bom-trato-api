import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { readOrganizationPlatformAccess } from '../access/prismaOrganizationPlatformAccess.js';

import { PrismaOrganizationTeamAccess } from './prismaOrganizationTeamAccess.js';

vi.mock('../access/prismaOrganizationPlatformAccess.js', () => ({ readOrganizationPlatformAccess: vi.fn() }));

const read = vi.mocked(readOrganizationPlatformAccess);
const now = new Date('2026-01-01');
const params = { organizationId: 'org', now };

function fixture() {
  const price = vi.fn().mockResolvedValue({ plan: { maxUsers: 5, teamManagementEnabled: true } });
  const pending = vi.fn().mockResolvedValue(null);
  const db = {
    planPrice: { findUniqueOrThrow: price },
    planChange: { findUnique: pending },
  } as unknown as Prisma.TransactionClient;
  const service = new PrismaOrganizationTeamAccess(db);
  return { service, price, pending, db };
}

function snapshot(source: string, hasAccess: boolean, billingNeedsReconciliation = false, planPriceId?: string) {
  return {
    access: { source, hasAccess, billingNeedsReconciliation },
    currentSubscription: planPriceId ? { planPriceId } : null,
    trial: null,
    hasPaidSubscriptionHistory: false,
  } as Awaited<ReturnType<typeof readOrganizationPlatformAccess>>;
}

describe('PrismaOrganizationTeamAccess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks all team access while billing requires reconciliation', async () => {
    const f = fixture();
    read.mockResolvedValue(snapshot('NONE', false, true));
    await expect(f.service.read(params)).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(f.price).not.toHaveBeenCalled();
  });

  it('limits trial access to a single user without team management', async () => {
    const f = fixture();
    read.mockResolvedValue(snapshot('TRIAL', true));
    expect(await f.service.read(params)).toEqual({ hasAccess: true, teamManagementEnabled: false, memberLimit: 1 });
    expect(read).toHaveBeenCalledWith(f.db, params.organizationId, now);
    expect(f.price).not.toHaveBeenCalled();
  });

  it('denies access without a current subscription', async () => {
    const f = fixture();
    read.mockResolvedValue(snapshot('NONE', false));
    expect(await f.service.read(params)).toEqual({ hasAccess: false, teamManagementEnabled: false, memberLimit: 0 });
    expect(f.pending).not.toHaveBeenCalled();
  });

  it.each([
    [null, 5],
    [2, 2],
    [10, 5],
  ] as const)('caps member limits under pending changes', async (targetMaxUsers, memberLimit) => {
    const f = fixture();
    read.mockResolvedValue(snapshot('SUBSCRIPTION', true, false, 'price'));
    f.pending.mockResolvedValue(targetMaxUsers === null ? null : { targetMaxUsers });
    expect(await f.service.read(params)).toEqual({ hasAccess: true, teamManagementEnabled: true, memberLimit });
    expect(f.price).toHaveBeenCalledWith({ where: { id: 'price' }, include: { plan: true } });
    expect(f.pending).toHaveBeenCalledWith({ where: { activeOrganizationId: 'org' } });
  });

  it('does not grant access when a current subscription is ineligible', async () => {
    const f = fixture();
    read.mockResolvedValue(snapshot('SUBSCRIPTION', false, false, 'price'));
    expect(await f.service.read(params)).toMatchObject({ hasAccess: false });
  });
});
