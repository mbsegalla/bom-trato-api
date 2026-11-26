import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BillingSuccessNotificationUnitOfWork } from '../ports/billingSuccessNotificationUnitOfWork.port.js';
import type { BillingSuccessNotification, BillingSuccessNotificationTransaction } from '../types/billing.types.js';
import { QueueNextBillingConfirmationUseCase } from './queueNextBillingConfirmation.useCase.js';

const now = new Date('2026-01-01T12:00:00Z');
const invoice = {
  kind: 'INVOICE',
  id: 'invoice',
  organizationId: 'org',
  organizationName: 'Fixture business',
  stripeInvoiceId: 'in_fixture',
  billingReason: 'subscription_create',
  number: 'FIX-001',
  amountPaid: 5990,
  currency: 'brl',
  paidAt: now,
  subscriptionStatus: 'ACTIVE',
  recipient: { userId: 'owner', email: 'fixture@example.invalid', enabled: true },
} satisfies BillingSuccessNotification;

function fixture(notification: BillingSuccessNotification) {
  const email = vi.fn().mockResolvedValue(undefined);
  const inApp = vi.fn().mockResolvedValue(undefined);
  const tx = {
    billingSuccessNotification: notification,
    notificationOutbox: { enqueue: email },
    inAppNotifications: { enqueue: inApp },
  } as unknown as BillingSuccessNotificationTransaction;
  const unit = {
    run: vi.fn(async (operation: (context: BillingSuccessNotificationTransaction) => Promise<void>) => {
      await operation(tx);
      return true;
    }),
  };
  const useCase = new QueueNextBillingConfirmationUseCase(unit as BillingSuccessNotificationUnitOfWork);

  return { email, inApp, unit, useCase };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => vi.useRealTimers());

describe('QueueNextBillingConfirmationUseCase', () => {
  it.each([
    { billingReason: 'subscription_create', subscriptionStatus: 'ACTIVE', type: 'SUBSCRIPTION_ACTIVATED' },
    { billingReason: 'subscription_create', subscriptionStatus: 'PAST_DUE', type: 'PAYMENT_CONFIRMED' },
    { billingReason: 'subscription_cycle', subscriptionStatus: 'ACTIVE', type: 'PAYMENT_CONFIRMED' },
  ])('queues the correct successful billing notification: $type', async ({ billingReason, subscriptionStatus, type }) => {
    const f = fixture({ ...invoice, billingReason, subscriptionStatus });

    expect(await f.useCase.execute()).toBe(true);
    expect(f.email).toHaveBeenCalledWith({
      key: 'invoice-paid/in_fixture',
      recipient: invoice.recipient.email,
      expiresAt: new Date(now.getTime() + 86400000),
      content: { type, invoiceNumber: invoice.number, amountPaidInCents: invoice.amountPaid, currency: invoice.currency },
    });
    expect(f.inApp).toHaveBeenCalledWith(expect.objectContaining({
      key: 'billing-success/in_fixture',
      userId: invoice.recipient.userId,
      organizationId: invoice.organizationId,
      type,
      href: '/settings?tab=billing',
    }));
  });

  it('queues plan confirmation separately from invoice payment using stable event keys', async () => {
    const f = fixture({
      kind: 'PLAN_CHANGE',
      id: 'change',
      organizationId: invoice.organizationId,
      organizationName: invoice.organizationName,
      planName: 'Fixture professional',
      appliedAt: now,
      recipient: invoice.recipient,
    });

    await f.useCase.execute();

    expect(f.email).toHaveBeenCalledWith(expect.objectContaining({
      key: 'plan-change-applied/change',
      content: { type: 'PLAN_CHANGE_CONFIRMED', organizationName: invoice.organizationName, planName: 'Fixture professional' },
    }));
    expect(f.inApp).toHaveBeenCalledWith(expect.objectContaining({
      key: 'plan-change-confirmed/change', type: 'PLAN_CHANGE_CONFIRMED', userId: invoice.recipient.userId,
    }));
  });

  it.each([
    { ...invoice, paidAt: null },
    { ...invoice, paidAt: new Date(now.getTime() - 86400000) },
    { ...invoice, recipient: { ...invoice.recipient, enabled: false } },
  ])('skips disabled recipients and missing or expired payment evidence', async (notification) => {
    const f = fixture(notification);

    expect(await f.useCase.execute()).toBe(true);
    expect(f.email).not.toHaveBeenCalled();
    expect(f.inApp).not.toHaveBeenCalled();
  });

  it('propagates outbox failures to the transaction rather than emitting a partial confirmation', async () => {
    const f = fixture(invoice);
    f.email.mockRejectedValueOnce(new Error('Fixture outbox failure'));

    await expect(f.useCase.execute()).rejects.toThrow('Fixture outbox failure');
    expect(f.inApp).not.toHaveBeenCalled();
  });
});
