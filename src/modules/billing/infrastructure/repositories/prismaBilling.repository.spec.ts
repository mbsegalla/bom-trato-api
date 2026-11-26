import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { BillingWork } from '../events/billing.events.js';
import type { BillingWorkerNotifier } from '../events/billingWorkerNotifier.service.js';

import { PrismaBillingRepository } from './prismaBilling.repository.js';

const organizationId = 'org';
const userId = 'owner';
const now = new Date('2026-01-01T12:00:00Z');
const owner = { role: 'OWNER', organization: { ownerId: userId }, user: { emailVerifiedAt: now } };
const price = {
  id: 'price',
  stripePriceId: 'price_fixture',
  amountInCents: 5990,
  currency: 'brl',
  interval: 'MONTH',
  intervalCount: 1,
  plan: { stripeProductId: 'prod_fixture' },
};

function fixture() {
  const db = {
    organizationMember: { findUnique: vi.fn().mockResolvedValue(owner) },
    organization: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ownerId: userId, _count: { organizationMembers: 3 } }),
    },
    subscription: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    planPrice: {
      findFirst: vi.fn().mockResolvedValue(price),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ plan: { maxUsers: 5, teamManagementEnabled: true } }),
    },
    billingCustomer: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    checkoutAttempt: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
    billingInvoice: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const scheduleChanged = vi.fn();
  const repository = new PrismaBillingRepository(
    db as unknown as PrismaService,
    { scheduleChanged } as unknown as BillingWorkerNotifier,
  );

  return { db, scheduleChanged, repository };
}

describe('PrismaBillingRepository scoped reads and reconciliation scheduling', () => {
  it('checks membership and verifies owner identity independently of role', async () => {
    const f = fixture();
    await f.repository.assertMember(organizationId, userId);
    await f.repository.assertOwner(organizationId, userId);

    expect(f.db.organizationMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_userId: { organizationId, userId } },
      }),
    );

    f.db.organizationMember.findUnique.mockResolvedValueOnce(null);
    await expect(f.repository.assertMember(organizationId, userId)).rejects.toThrow('ORGANIZATION_NOT_FOUND');

    for (const member of [
      { ...owner, role: 'MEMBER' },
      { ...owner, organization: { ownerId: 'other' } },
    ]) {
      f.db.organizationMember.findUnique.mockResolvedValueOnce(member);
      await expect(f.repository.assertOwner(organizationId, userId)).rejects.toThrow('OWNER_REQUIRED');
    }

    f.db.organizationMember.findUnique.mockResolvedValueOnce({ ...owner, user: { emailVerifiedAt: null } });
    await expect(f.repository.assertOwner(organizationId, userId)).rejects.toThrow('EMAIL_NOT_VERIFIED');
  });

  it('exposes only published and active catalog prices and maps the provider product identity', async () => {
    const f = fixture();
    const { plan, ...fields } = price;

    expect(await f.repository.availablePrice(price.id)).toEqual({ ...fields, stripeProductId: plan.stripeProductId });
    expect(f.db.planPrice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: price.id, published: true, stripeActive: true, plan: { published: true, stripeActive: true } },
      }),
    );

    f.db.planPrice.findFirst.mockResolvedValueOnce(null);
    await expect(f.repository.availablePrice('missing')).rejects.toThrow('PLAN_UNAVAILABLE');
  });

  it('rejects ambiguous active subscriptions and falls back to history only when none are ongoing', async () => {
    const f = fixture();
    const subscription = { id: 'subscription', planPriceId: price.id };

    f.db.subscription.findMany.mockResolvedValueOnce([subscription, { id: 'other' }]);
    await expect(f.repository.currentSubscription(organizationId)).rejects.toThrow('MULTIPLE_SUBSCRIPTIONS');
    expect(f.db.subscription.findFirst).not.toHaveBeenCalled();

    f.db.subscription.findMany.mockResolvedValueOnce([subscription]);
    expect(await f.repository.currentSubscription(organizationId)).toEqual(subscription);

    f.db.subscription.findFirst.mockResolvedValueOnce({ ...subscription, status: 'CANCELED' });
    expect(await f.repository.currentSubscription(organizationId)).toMatchObject({ status: 'CANCELED' });
    expect(f.db.subscription.findMany).toHaveBeenCalledWith({
      where: { organizationId, status: { notIn: ['CANCELED', 'INCOMPLETE_EXPIRED'] } },
      orderBy: [{ stripeCreatedAt: 'desc' }, { id: 'desc' }],
      take: 2,
    });
  });

  it('uses persisted plan entitlements and does not infer membership capacity from a missing subscription', async () => {
    const f = fixture();

    expect(await f.repository.entitlements(organizationId, 'member')).toEqual({
      maxUsers: 0,
      teamManagementEnabled: false,
      memberCount: 3,
      isOwner: false,
    });
    expect(f.db.planPrice.findUniqueOrThrow).not.toHaveBeenCalled();

    f.db.subscription.findMany.mockResolvedValueOnce([{ planPriceId: price.id }]);
    expect(await f.repository.entitlements(organizationId, userId)).toEqual({
      maxUsers: 5,
      teamManagementEnabled: true,
      memberCount: 3,
      isOwner: true,
    });
  });

  it('validates invoice cursors within the tenant and paginates equal timestamps deterministically', async () => {
    const f = fixture();
    await expect(f.repository.invoices({ organizationId, cursor: 'foreign', limit: 1 })).rejects.toThrow(
      'INVALID_CURSOR',
    );
    expect(f.db.billingInvoice.findMany).not.toHaveBeenCalled();

    const anchor = { id: 'anchor', stripeCreatedAt: now };
    const invoice = { id: 'invoice', stripeCreatedAt: now };
    f.db.billingInvoice.findFirst.mockResolvedValueOnce(anchor);
    f.db.billingInvoice.findMany.mockResolvedValueOnce([invoice, { id: 'next' }]);

    expect(await f.repository.invoices({ organizationId, cursor: anchor.id, limit: 1 })).toEqual({
      items: [invoice],
      nextCursor: invoice.id,
    });
    expect(f.db.billingInvoice.findFirst).toHaveBeenCalledWith({
      where: { id: anchor.id, organizationId },
      select: { id: true, stripeCreatedAt: true },
    });
    expect(f.db.billingInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId,
          OR: [{ stripeCreatedAt: { lt: now } }, { stripeCreatedAt: now, id: { lt: anchor.id } }],
        },
        take: 2,
        orderBy: [{ stripeCreatedAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('reserves a single active checkout and releases its active identity on terminal outcomes', async () => {
    const f = fixture();
    const input = {
      id: 'attempt',
      organizationId,
      planPriceId: price.id,
      stripePriceId: price.stripePriceId,
      returnUrl: 'https://app.example.invalid/onboarding',
      expiresAt: now,
    };

    await f.repository.createCheckout(input);
    await f.repository.pendingCheckout(organizationId);
    await f.repository.attachCheckout(input.id, 'cs_fixture');
    await f.repository.closeCheckout(input.id, 'COMPLETE');

    expect(f.db.checkoutAttempt.create).toHaveBeenCalledWith({
      data: { ...input, activeOrganizationId: organizationId },
    });
    expect(f.db.checkoutAttempt.findUnique).toHaveBeenCalledWith({ where: { activeOrganizationId: organizationId } });
    expect(f.db.checkoutAttempt.update).toHaveBeenNthCalledWith(1, {
      where: { id: input.id },
      data: { stripeSessionId: 'cs_fixture' },
    });
    expect(f.db.checkoutAttempt.update).toHaveBeenNthCalledWith(2, {
      where: { id: input.id },
      data: { status: 'COMPLETE', activeOrganizationId: null },
    });
  });

  it('bounds pending-invoice reconciliation and wakes the worker only after persisting the next attempt', async () => {
    const f = fixture();
    f.db.billingInvoice.findMany.mockResolvedValueOnce([{ stripeInvoiceId: 'in_pending' }]);
    expect(await f.repository.pendingInvoiceIds(organizationId)).toEqual(['in_pending']);
    expect(f.db.billingInvoice.findMany).toHaveBeenCalledWith({
      where: { organizationId, status: { in: ['draft', 'open', 'uncollectible'] } },
      select: { stripeInvoiceId: true },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 20,
    });

    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      await f.repository.postponeReconciliation(organizationId);
      expect(f.db.billingCustomer.update).toHaveBeenCalledWith({
        where: { organizationId },
        data: { nextReconcileAt: new Date(now.getTime() + 300000) },
      });
      expect(f.scheduleChanged).toHaveBeenCalledWith(BillingWork.RECONCILIATION);
      expect(f.db.billingCustomer.update.mock.invocationCallOrder[0]).toBeLessThan(
        f.scheduleChanged.mock.invocationCallOrder[0],
      );

      f.db.billingCustomer.update.mockRejectedValueOnce(new Error('Fixture unavailable'));
      await expect(f.repository.postponeReconciliation(organizationId)).rejects.toThrow('Fixture unavailable');
      expect(f.scheduleChanged).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
