import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { SubscriptionProps } from '../../../billing/domain/entities/subscription.entity.js';

import { readOrganizationAccess } from './prismaOrganizationAccess.js';
import { readOrganizationPlatformAccess } from './prismaOrganizationPlatformAccess.js';
import { PrismaOrganizationPlatformAccessReader } from './prismaOrganizationPlatformAccessReader.js';

const now = new Date('2026-01-01T00:00:00Z');
const future = new Date(now.getTime() + 86400000);
const params = { organizationId: 'org', userId: 'owner' };
const trial = {
  id: 'trial',
  organizationId: 'org',
  ownerId: 'owner',
  startsAt: now,
  expiresAt: future,
  convertedAt: null,
  revokedAt: null,
};
const subscription: SubscriptionProps = {
  id: 'subscription',
  organizationId: 'org',
  planPriceId: 'price',
  stripeSubscriptionId: 'sub_fixture',
  status: 'ACTIVE',
  currentPeriodStart: now,
  currentPeriodEnd: future,
  paidThrough: future,
  cancelAtPeriodEnd: false,
  canceledAt: null,
  endedAt: null,
  stripeCreatedAt: now,
};

function fixture() {
  const organization = vi.fn().mockResolvedValue({ subscriptions: [], trial });
  const member = vi.fn().mockResolvedValue({ user: { disabledAt: null, emailVerifiedAt: now } });
  const paidSubscription = vi.fn().mockResolvedValue(null);
  const paidInvoice = vi.fn().mockResolvedValue(null);
  const client = {
    organization: { findUnique: organization },
    organizationMember: { findUnique: member },
    subscription: { findFirst: paidSubscription },
    billingInvoice: { findFirst: paidInvoice },
    $executeRaw: vi.fn().mockResolvedValue(0),
  };
  const db = client as unknown as Prisma.TransactionClient;
  const transaction = vi.fn(async (operation: (value: typeof client) => Promise<unknown>) => operation(client));
  const reader = new PrismaOrganizationPlatformAccessReader({ $transaction: transaction } as unknown as PrismaService);

  return { db, organization, member, paidSubscription, paidInvoice, reader, transaction };
}

describe('organization platform access persistence', () => {
  it('returns no access for an unknown organization without querying billing history', async () => {
    const f = fixture();
    f.organization.mockResolvedValue(null);
    expect(await readOrganizationPlatformAccess(f.db, 'org', now)).toEqual({
      access: { hasAccess: false, source: 'NONE', billingNeedsReconciliation: false },
      currentSubscription: null,
      trial: null,
      hasPaidSubscriptionHistory: false,
    });
    expect(f.paidSubscription).not.toHaveBeenCalled();
    expect(f.paidInvoice).not.toHaveBeenCalled();
  });

  it('loads only ongoing subscriptions with deterministic ordering and a bounded result', async () => {
    const f = fixture();
    f.organization.mockResolvedValue({ subscriptions: [subscription], trial: null });
    const result = await readOrganizationPlatformAccess(f.db, 'org', now);

    expect(result.currentSubscription).toEqual(subscription);
    expect(result.access.source).toBe('SUBSCRIPTION');
    expect(f.organization).toHaveBeenCalledWith({
      where: { id: 'org' },
      select: {
        trial: true,
        subscriptions: {
          where: { status: { notIn: ['CANCELED', 'INCOMPLETE_EXPIRED'] } },
          orderBy: [{ stripeCreatedAt: 'desc' }, { id: 'desc' }],
          take: 2,
        },
      },
    });
  });

  it('grants trial access only without paid history', async () => {
    const f = fixture();
    expect(await readOrganizationPlatformAccess(f.db, 'org', now)).toMatchObject({
      access: { hasAccess: true, source: 'TRIAL' },
      hasPaidSubscriptionHistory: false,
    });
    expect(f.paidSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org', paidThrough: { not: null } },
      }),
    );
    expect(f.paidInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org', OR: [{ paidAt: { not: null } }, { status: 'paid' }] },
      }),
    );
  });

  it.each(['subscription', 'invoice'])('prevents trial reactivation when %s has paid history', async (source) => {
    const f = fixture();
    (source === 'subscription' ? f.paidSubscription : f.paidInvoice).mockResolvedValue({ id: 'paid' });

    expect(await readOrganizationPlatformAccess(f.db, 'org', now)).toMatchObject({
      access: { hasAccess: false, source: 'NONE' },
      hasPaidSubscriptionHistory: true,
    });
  });

  it('fails closed for duplicate ongoing subscriptions', async () => {
    const f = fixture();
    f.organization.mockResolvedValue({ trial, subscriptions: [subscription, { ...subscription, id: 'duplicate' }] });
    expect(await readOrganizationPlatformAccess(f.db, 'org', now)).toMatchObject({
      access: { hasAccess: false, billingNeedsReconciliation: true },
    });
  });

  it('does not read billing details for nonmembers', async () => {
    const f = fixture();
    f.member.mockResolvedValue(null);
    expect(await readOrganizationAccess(f.db, params)).toEqual({
      isMember: false,
      verified: false,
      hasPlatformAccess: false,
      source: 'NONE',
      billingNeedsReconciliation: false,
    });
    expect(f.organization).not.toHaveBeenCalled();
  });

  it.each([
    [{ disabledAt: null, emailVerifiedAt: now }, true],
    [{ disabledAt: now, emailVerifiedAt: now }, false],
    [{ disabledAt: null, emailVerifiedAt: null }, false],
  ] as const)('preserves verified identity state independently of platform entitlement', async (user, verified) => {
    const f = fixture();
    f.member.mockResolvedValue({ user });
    f.organization.mockResolvedValue({ subscriptions: [], trial: null });

    expect(await readOrganizationAccess(f.db, params)).toMatchObject({
      isMember: true,
      verified,
      hasPlatformAccess: false,
    });
    expect(f.member).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_userId: { organizationId: 'org', userId: 'owner' } },
      }),
    );
  });

  it('reads access through a repeatable read transaction', async () => {
    const f = fixture();
    f.member.mockResolvedValue(null);
    expect(await f.reader.read(params)).toMatchObject({ isMember: false });
    expect(f.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'RepeatableRead' }),
    );
  });
});
