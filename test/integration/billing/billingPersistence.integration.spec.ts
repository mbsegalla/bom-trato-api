import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';

import type { RemoteInvoice, RemoteSubscription } from '../../../src/modules/billing/domain/types/billing.types.js';
import { BillingWork } from '../../../src/modules/billing/infrastructure/events/billing.events.js';
import type { BillingWorkerNotifier } from '../../../src/modules/billing/infrastructure/events/billingWorkerNotifier.service.js';
import { PrismaBillingRepository } from '../../../src/modules/billing/infrastructure/repositories/prismaBilling.repository.js';

import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';

databaseSuite('billing persistence (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  async function fixture() {
    const { organizationId, userId } = await db.tenant();
    const suffix = randomUUID();
    const now = new Date();
    const end = new Date(now.getTime() + 86400000);
    const plan = await db.prisma.plan.create({ data: {
      code: 'fixture-' + suffix, name: 'Fixture plan', stripeProductId: 'prod_' + suffix,
      maxUsers: 5, teamManagementEnabled: true, published: true,
    } });
    db.cleanup(() => db.prisma.plan.deleteMany({ where: { id: plan.id } }));
    const price = await db.prisma.planPrice.create({ data: {
      planId: plan.id, stripePriceId: 'price_' + suffix, currency: 'brl',
      amountInCents: 5990, interval: 'MONTH', published: true,
    } });
    db.cleanup(() => db.prisma.planPrice.deleteMany({ where: { id: price.id } }));
    const customer = await db.prisma.billingCustomer.create({ data: {
      organizationId, billingName: 'Fixture organization', billingEmail: suffix + '@example.invalid',
      nextReconcileAt: end,
    } });
    db.cleanup(() => db.prisma.billingCustomer.deleteMany({ where: { id: customer.id } }));
    db.cleanup(() => db.prisma.checkoutAttempt.deleteMany({ where: { organizationId } }));
    db.cleanup(() => db.prisma.paymentMethodUpdate.deleteMany({ where: { organizationId } }));
    db.cleanup(() => db.prisma.planChange.deleteMany({ where: { organizationId } }));
    db.cleanup(() => db.prisma.subscription.deleteMany({ where: { organizationId } }));
    db.cleanup(() => db.prisma.billingInvoice.deleteMany({ where: { organizationId } }));
    const notify = vi.fn();
    const scheduleChanged = vi.fn();
    const repository = new PrismaBillingRepository(db.prisma, { notify, scheduleChanged } as unknown as BillingWorkerNotifier);
    const stripeCustomerId = 'cus_' + suffix;
    const subscription: RemoteSubscription = {
      stripeSubscriptionId: 'sub_' + suffix, stripePriceId: price.stripePriceId,
      status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: end,
      cancelAtPeriodEnd: false, canceledAt: null, endedAt: null, stripeCreatedAt: now,
    };
    const invoice: RemoteInvoice = {
      stripeInvoiceId: 'in_' + suffix, stripeSubscriptionId: subscription.stripeSubscriptionId,
      number: 'fixture', status: 'paid', currency: 'brl', amountDue: 5990, amountPaid: 5990,
      hostedInvoiceUrl: null, invoicePdf: null, paidAt: now, paidThrough: end,
      billingReason: 'subscription_cycle', stripeCreatedAt: now,
    };
    const snapshot = { subscriptions: [subscription], invoices: [invoice] };
    const save = () => repository.saveSnapshot({ organizationId, snapshot });
    const readSubscription = () => db.prisma.subscription.findUniqueOrThrow({
      where: { stripeSubscriptionId: subscription.stripeSubscriptionId },
    });
    const readInvoice = () => db.prisma.billingInvoice.findUniqueOrThrow({
      where: { stripeInvoiceId: invoice.stripeInvoiceId },
    });
    const readCustomer = () => db.prisma.billingCustomer.findUniqueOrThrow({ where: { id: customer.id } });
    async function checkout() {
      return repository.createCheckout({
        id: randomUUID(), organizationId, planPriceId: price.id, stripePriceId: price.stripePriceId,
        returnUrl: 'https://example.invalid/billing', expiresAt: end,
      });
    }

    return { organizationId, userId, plan, price, customer, repository, notify, scheduleChanged, stripeCustomerId,
      now, end, subscription, invoice, snapshot, save, readSubscription, readInvoice, readCustomer, checkout };
  }

  it('marks customer creation only once and keeps the original checkpoint', async () => {
    const f = await fixture();
    await f.repository.markCustomerCreation(f.customer.id, f.now);
    await f.repository.markCustomerCreation(f.customer.id, f.end);

    expect(await f.repository.customer(f.organizationId)).toMatchObject({ creationRequestedAt: f.now });
    expect(await f.repository.customerByStripeId(f.stripeCustomerId)).toBeNull();
    await expect(f.repository.customer(randomUUID())).rejects.toThrow('ORGANIZATION_NOT_FOUND');
  });

  it('binds a unique customer identity idempotently and schedules reconciliation after the commit', async () => {
    const f = await fixture();
    f.notify.mockImplementation(() => undefined);
    await f.repository.setCustomerId(f.customer.id, f.stripeCustomerId);
    await f.repository.setCustomerId(f.customer.id, f.stripeCustomerId);

    expect(await f.readCustomer()).toMatchObject({ stripeCustomerId: f.stripeCustomerId });
    expect(await f.repository.customerByStripeId(f.stripeCustomerId)).toMatchObject({ id: f.customer.id });
    expect(await db.prisma.billingCustomerReference.count({ where: { billingCustomerId: f.customer.id } })).toBe(1);
    expect(f.notify).toHaveBeenCalledWith(BillingWork.RECONCILIATION);
    expect(f.notify).toHaveBeenCalledTimes(2);
  });

  it('rejects an unknown customer and a different remote identity without notifying', async () => {
    const f = await fixture();
    await expect(f.repository.setCustomerId(randomUUID(), f.stripeCustomerId)).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    await f.repository.setCustomerId(f.customer.id, f.stripeCustomerId);
    f.notify.mockClear();
    await expect(f.repository.setCustomerId(f.customer.id, 'cus_other_' + randomUUID()))
      .rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(f.notify).not.toHaveBeenCalled();
    expect(await f.readCustomer()).toMatchObject({ stripeCustomerId: f.stripeCustomerId });
  });

  it('does not bind a remote customer reference owned by another organization', async () => {
    const f = await fixture();
    const other = await fixture();
    await f.repository.setCustomerId(f.customer.id, f.stripeCustomerId);

    await expect(other.repository.setCustomerId(other.customer.id, f.stripeCustomerId))
      .rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(await other.readCustomer()).toMatchObject({ stripeCustomerId: null });
    expect(other.notify).not.toHaveBeenCalled();
  });

  it('updates the persisted billing name and rejects missing customers', async () => {
    const f = await fixture();
    await f.repository.setCustomerName(f.customer.id, 'New billing name');
    expect(await f.readCustomer()).toMatchObject({ billingName: 'New billing name' });
    await expect(f.repository.setCustomerName(randomUUID(), 'Missing')).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
  });

  it('persists a subscription and its invoice and advances paid-through monotonically', async () => {
    const f = await fixture();
    await f.save();

    const subscription = await f.readSubscription();
    expect(subscription).toMatchObject({ organizationId: f.organizationId, planPriceId: f.price.id, paidThrough: f.end });
    expect(await f.readInvoice()).toMatchObject({ organizationId: f.organizationId, subscriptionId: subscription.id, amountPaid: 5990 });
    await f.repository.saveSnapshot({ organizationId: f.organizationId, snapshot: {
      subscriptions: [f.subscription], invoices: [{ ...f.invoice, paidThrough: f.now }],
    } });
    expect(await f.readSubscription()).toMatchObject({ id: subscription.id, paidThrough: f.end });
    expect(await db.prisma.billingInvoice.count({ where: { organizationId: f.organizationId } })).toBe(1);
    expect(f.notify).toHaveBeenCalledWith(BillingWork.CONFIRMATIONS);
  });

  it('does not grant paid-through for unpaid invoices and ignores invoices unrelated to the snapshot', async () => {
    const f = await fixture();
    await f.repository.saveSnapshot({ organizationId: f.organizationId, snapshot: {
      subscriptions: [f.subscription],
      invoices: [
        { ...f.invoice, status: 'open', amountPaid: 0, paidAt: null },
        { ...f.invoice, stripeInvoiceId: 'in_unrelated_' + randomUUID(), stripeSubscriptionId: 'sub_unknown' },
      ],
    } });
    expect(await f.readSubscription()).toMatchObject({ paidThrough: null });
    expect(await db.prisma.billingInvoice.count({ where: { organizationId: f.organizationId } })).toBe(1);
    expect(await f.readInvoice()).toMatchObject({ status: 'open', amountPaid: 0 });
  });

  it('rejects an unknown catalog price without writing any snapshot rows', async () => {
    const f = await fixture();
    await expect(f.repository.saveSnapshot({ organizationId: f.organizationId, snapshot: {
      subscriptions: [{ ...f.subscription, stripePriceId: 'missing' }], invoices: [f.invoice],
    } })).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(await db.prisma.subscription.count({ where: { organizationId: f.organizationId } })).toBe(0);
    expect(f.notify).not.toHaveBeenCalled();
  });

  it('rejects a subscription identity belonging to a different tenant', async () => {
    const first = await fixture();
    const second = await fixture();
    await first.save();
    await expect(second.repository.saveSnapshot({ organizationId: second.organizationId, snapshot: {
      subscriptions: [first.subscription], invoices: [],
    } })).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(await db.prisma.subscription.count({ where: { organizationId: second.organizationId } })).toBe(0);
    expect(await first.readSubscription()).toMatchObject({ organizationId: first.organizationId });
  });

  it('rolls back the newly inserted subscription when an invoice belongs to another tenant', async () => {
    const first = await fixture();
    const second = await fixture();
    await first.save();
    await expect(second.repository.saveSnapshot({ organizationId: second.organizationId, snapshot: {
      subscriptions: [second.subscription],
      invoices: [{ ...first.invoice, stripeSubscriptionId: second.subscription.stripeSubscriptionId }],
    } })).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(await db.prisma.subscription.count({ where: { organizationId: second.organizationId } })).toBe(0);
    expect(second.notify).not.toHaveBeenCalled();
    expect(await first.readInvoice()).toMatchObject({ organizationId: first.organizationId });
  });

  it('marks deleted invoices only within the specified tenant', async () => {
    const first = await fixture();
    const second = await fixture();
    await first.save();
    await second.save();
    await first.repository.saveSnapshot({ organizationId: first.organizationId, snapshot: {
      subscriptions: [], invoices: [], deletedInvoiceIds: [first.invoice.stripeInvoiceId, second.invoice.stripeInvoiceId],
    } });
    expect(await first.readInvoice()).toMatchObject({ status: 'deleted' });
    expect(await second.readInvoice()).toMatchObject({ status: 'paid' });
  });

  it('closes the active checkout and persists both reconciliation checkpoints with the snapshot', async () => {
    const f = await fixture();
    const attempt = await f.checkout();
    await f.repository.saveSnapshot({
      organizationId: f.organizationId, snapshot: f.snapshot,
      checkout: { id: attempt.id, stripeSessionId: 'cs_' + randomUUID(), status: 'COMPLETE' },
      nextReconcileAt: f.end, invoiceHistorySyncedAt: f.now,
    });
    expect(await f.repository.pendingCheckout(f.organizationId)).toBeNull();
    expect(await db.prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } }))
      .toMatchObject({ status: 'COMPLETE', activeOrganizationId: null, stripeSessionId: expect.any(String) });
    expect(await f.readCustomer()).toMatchObject({ nextReconcileAt: f.end, invoiceHistorySyncedAt: f.now });
    expect(f.scheduleChanged).toHaveBeenCalledWith(BillingWork.RECONCILIATION);
    expect(f.notify).toHaveBeenCalledWith(BillingWork.CONFIRMATIONS);
  });

  it('rolls back snapshot changes and does not schedule work when checkout closure fails', async () => {
    const f = await fixture();
    await expect(f.repository.saveSnapshot({
      organizationId: f.organizationId, snapshot: f.snapshot,
      checkout: { id: randomUUID(), stripeSessionId: 'cs_fixture', status: 'COMPLETE' },
      nextReconcileAt: f.end, invoiceHistorySyncedAt: f.now,
    })).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(await db.prisma.subscription.count({ where: { organizationId: f.organizationId } })).toBe(0);
    expect(await db.prisma.billingInvoice.count({ where: { organizationId: f.organizationId } })).toBe(0);
    expect(await f.readCustomer()).toMatchObject({ invoiceHistorySyncedAt: null });
    expect(f.notify).not.toHaveBeenCalled();
    expect(f.scheduleChanged).not.toHaveBeenCalled();
  });

  it('detaches a deleted Stripe customer, cancels subscriptions and releases pending checkout', async () => {
    const f = await fixture();
    await f.repository.setCustomerId(f.customer.id, f.stripeCustomerId);
    await f.repository.markCustomerCreation(f.customer.id, f.now);
    await f.save();
    const attempt = await f.checkout();

    await f.repository.handleDeletedCustomer({ organizationId: f.organizationId, stripeCustomerId: f.stripeCustomerId, deletedAt: f.now });
    expect(await f.readCustomer()).toMatchObject({ stripeCustomerId: null, creationRequestedAt: null, invoiceHistorySyncedAt: null });
    expect(await f.readSubscription()).toMatchObject({ status: 'CANCELED', canceledAt: f.now, endedAt: f.now, cancelAtPeriodEnd: false });
    expect(await db.prisma.checkoutAttempt.findUniqueOrThrow({ where: { id: attempt.id } }))
      .toMatchObject({ status: 'EXPIRED', activeOrganizationId: null });
    expect(await db.prisma.billingCustomerReference.findUniqueOrThrow({ where: { stripeCustomerId: f.stripeCustomerId } }))
      .toMatchObject({ detachedAt: f.now });
    expect(await f.repository.customerByStripeId(f.stripeCustomerId)).toMatchObject({ id: f.customer.id, stripeCustomerId: null });
    await expect(f.repository.setCustomerId(f.customer.id, f.stripeCustomerId)).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(await f.readInvoice()).toMatchObject({ status: 'paid' });
  });

  it('ignores an outdated deletion and does not detach a different active customer', async () => {
    const f = await fixture();
    await f.repository.setCustomerId(f.customer.id, f.stripeCustomerId);
    await f.save();
    await f.repository.handleDeletedCustomer({ organizationId: f.organizationId, stripeCustomerId: 'cus_old', deletedAt: f.now });

    expect(await f.readCustomer()).toMatchObject({ stripeCustomerId: f.stripeCustomerId });
    expect(await f.readSubscription()).toMatchObject({ status: 'ACTIVE' });
  });

  it('returns notification context only for the requested organization and provider object', async () => {
    const f = await fixture();
    await f.save();
    expect(await f.repository.notificationContext(f.organizationId, f.invoice.stripeInvoiceId)).toMatchObject({
      organizationName: 'Fixture organization', recipientUserId: f.userId, recipientEnabled: true,
      invoiceStatus: 'paid', amountRemaining: 0, subscriptionStatus: null,
    });
    expect(await f.repository.notificationContext(f.organizationId, f.subscription.stripeSubscriptionId)).toMatchObject({
      subscriptionStatus: 'ACTIVE', invoiceStatus: null,
    });
    expect(await f.repository.notificationContext(randomUUID(), f.invoice.stripeInvoiceId)).toBeNull();
  });

  it('does not expose an invoice cursor belonging to another organization', async () => {
    const first = await fixture();
    const second = await fixture();
    await first.save();
    await second.save();
    const invoice = await first.readInvoice();
    await expect(second.repository.invoices({ organizationId: second.organizationId, cursor: invoice.id, limit: 1 }))
      .rejects.toThrow('INVALID_CURSOR');
    expect(await first.repository.invoices({ organizationId: first.organizationId, limit: 10 })).toMatchObject({
      items: [{ id: invoice.id }], nextCursor: null,
    });
  });
  it('reconstructs missing customer reference history when receiving a deletion', async () => {
    const f = await fixture();
    await db.prisma.billingCustomer.update({
      where: { id: f.customer.id }, data: { stripeCustomerId: f.stripeCustomerId },
    });
    await f.repository.handleDeletedCustomer({
      organizationId: f.organizationId, stripeCustomerId: f.stripeCustomerId, deletedAt: f.now,
    });
    expect(await db.prisma.billingCustomerReference.findUniqueOrThrow({ where: { stripeCustomerId: f.stripeCustomerId } }))
      .toMatchObject({ billingCustomerId: f.customer.id, detachedAt: f.now });
    expect(await f.readCustomer()).toMatchObject({ stripeCustomerId: null });
  });

  it('rejects a deletion with customer reference history belonging to a different organization', async () => {
    const first = await fixture();
    const second = await fixture();
    await db.prisma.billingCustomer.update({
      where: { id: first.customer.id }, data: { stripeCustomerId: first.stripeCustomerId },
    });
    await db.prisma.billingCustomerReference.create({ data: {
      billingCustomerId: second.customer.id, stripeCustomerId: first.stripeCustomerId,
    } });
    await expect(first.repository.handleDeletedCustomer({
      organizationId: first.organizationId, stripeCustomerId: first.stripeCustomerId, deletedAt: first.now,
    })).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(await first.readCustomer()).toMatchObject({ stripeCustomerId: first.stripeCustomerId });
  });

  it('keeps terminal subscription history and the original cancellation timestamp', async () => {
    const f = await fixture();
    await f.repository.setCustomerId(f.customer.id, f.stripeCustomerId);
    const canceledAt = new Date(f.now.getTime() - 1000);
    const historical = { ...f.subscription, stripeSubscriptionId: 'sub_history_' + randomUUID(), status: 'CANCELED' as const,
      canceledAt, endedAt: canceledAt };
    await f.repository.saveSnapshot({ organizationId: f.organizationId, snapshot: {
      subscriptions: [{ ...f.subscription, canceledAt, cancelAtPeriodEnd: true }, historical], invoices: [],
    } });
    await f.repository.handleDeletedCustomer({
      organizationId: f.organizationId, stripeCustomerId: f.stripeCustomerId, deletedAt: f.now,
    });
    expect(await f.readSubscription()).toMatchObject({
      status: 'CANCELED', canceledAt, endedAt: f.now, cancelAtPeriodEnd: false,
    });
    expect(await db.prisma.subscription.findUniqueOrThrow({ where: { stripeSubscriptionId: historical.stripeSubscriptionId } }))
      .toMatchObject({ status: 'CANCELED', canceledAt, endedAt: canceledAt });
  });

  it.each(['QUOTED', 'PROCESSING', 'PENDING_PAYMENT', 'SCHEDULED'] as const)(
    'cancels %s plan changes and pending payment method updates when the customer is deleted', async (status) => {
      const f = await fixture();
      await f.repository.setCustomerId(f.customer.id, f.stripeCustomerId);
      const periodStart = Math.floor(f.now.getTime() / 1000);
      const common = {
        organizationId: f.organizationId, requestedById: f.userId, stripeCustomerId: f.stripeCustomerId,
        stripeSubscriptionId: f.subscription.stripeSubscriptionId, expiresAt: f.end,
      };
      const change = await db.prisma.planChange.create({ data: {
        ...common, activeOrganizationId: f.organizationId, status, sourcePlanPriceId: f.price.id,
        targetPlanPriceId: f.price.id, targetMaxUsers: 5, stripeItemId: 'si_fixture',
        sourceStripePriceId: f.price.stripePriceId, targetStripePriceId: f.price.stripePriceId,
        mode: 'IMMEDIATE', currency: 'brl', amountDueNow: 0, targetAmountInCents: 5990,
        targetInterval: 'MONTH', targetIntervalCount: 1, periodStart, periodEnd: periodStart + 86400,
        prorationDate: periodStart,
      } });
      const update = await db.prisma.paymentMethodUpdate.create({ data: {
        ...common, activeOrganizationId: f.organizationId, consentVersion: '1.0', consentAcceptedAt: f.now,
      } });
      const completed = await db.prisma.paymentMethodUpdate.create({ data: {
        ...common, status: 'APPLIED', activeOrganizationId: null, consentVersion: '1.0',
        consentAcceptedAt: f.now, completedAt: f.now,
      } });

      await f.repository.handleDeletedCustomer({
        organizationId: f.organizationId, stripeCustomerId: f.stripeCustomerId, deletedAt: f.now,
      });

      expect(await db.prisma.planChange.findUniqueOrThrow({ where: { id: change.id } }))
        .toMatchObject({ status: 'CANCELED', activeOrganizationId: null });
      expect(await db.prisma.paymentMethodUpdate.findUniqueOrThrow({ where: { id: update.id } }))
        .toMatchObject({ status: 'CANCELED', activeOrganizationId: null, completedAt: f.now });
      expect(await db.prisma.paymentMethodUpdate.findUniqueOrThrow({ where: { id: completed.id } }))
        .toMatchObject({ status: 'APPLIED', completedAt: f.now });
    },
  );

  it('does not detach a customer if the organization or customer is absent', async () => {
    const f = await fixture();
    await f.repository.handleDeletedCustomer({
      organizationId: randomUUID(), stripeCustomerId: f.stripeCustomerId, deletedAt: f.now,
    });
    expect(await f.readCustomer()).toMatchObject({ stripeCustomerId: null });
    expect(await db.prisma.billingCustomerReference.findUnique({ where: { stripeCustomerId: f.stripeCustomerId } })).toBeNull();
  });

  it('does not advance paid-through when the paid invoice has no paid period', async () => {
    const f = await fixture();
    await f.repository.saveSnapshot({ organizationId: f.organizationId, snapshot: {
      subscriptions: [f.subscription], invoices: [{ ...f.invoice, paidThrough: null }],
    } });
    expect(await f.readSubscription()).toMatchObject({ paidThrough: null });
    expect(await f.readInvoice()).toMatchObject({ status: 'paid' });
  });

  it('persists invoice-history synchronization without scheduling reconciliation', async () => {
    const f = await fixture();
    await f.repository.saveSnapshot({
      organizationId: f.organizationId, snapshot: { subscriptions: [], invoices: [] }, invoiceHistorySyncedAt: f.now,
    });
    expect(await f.readCustomer()).toMatchObject({ invoiceHistorySyncedAt: f.now, nextReconcileAt: f.end });
    expect(f.scheduleChanged).not.toHaveBeenCalled();
    expect(f.notify).not.toHaveBeenCalled();
  });

  it('uses historical customer references without treating a detached customer as current', async () => {
    const f = await fixture();
    await f.repository.setCustomerId(f.customer.id, f.stripeCustomerId);
    await f.repository.handleDeletedCustomer({
      organizationId: f.organizationId, stripeCustomerId: f.stripeCustomerId, deletedAt: f.now,
    });
    const replacement = 'cus_new_' + randomUUID();
    await f.repository.setCustomerId(f.customer.id, replacement);
    expect(await f.repository.customerByStripeId(f.stripeCustomerId)).toMatchObject({ stripeCustomerId: replacement });
    expect(await f.repository.customerByStripeId(replacement)).toMatchObject({ id: f.customer.id });
    expect(await db.prisma.billingCustomerReference.count({ where: { billingCustomerId: f.customer.id } })).toBe(2);
  });
});
