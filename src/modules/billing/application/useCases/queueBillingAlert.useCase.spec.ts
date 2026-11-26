import { describe, expect, it, vi } from 'vitest';

import type { NotificationOutbox } from '../../../notifications/application/ports/notificationOutbox.port.js';
import type { InAppNotificationRepository } from '../../../notifications/domain/repositories/inAppNotification.repository.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { BillingNotificationContext, WebhookNotice } from '../../domain/types/billing.types.js';
import { QueueBillingAlertUseCase } from './queueBillingAlert.useCase.js';

const context: BillingNotificationContext = {
  organizationName: 'Fixture organization',
  recipientUserId: 'owner',
  recipient: 'owner@example.invalid',
  recipientEnabled: true,
  invoiceStatus: 'open',
  amountRemaining: 1200,
  subscriptionStatus: 'ACTIVE',
};
const event: WebhookNotice = {
  id: 'evt_fixture',
  type: 'invoice.payment_failed',
  stripeCustomerId: 'cus_fixture',
  stripeObjectId: 'in_fixture',
};

function fixture() {
  const notificationContext = vi.fn<BillingRepository['notificationContext']>().mockResolvedValue(context);
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const enqueueInApp = vi.fn().mockResolvedValue(undefined);
  const useCase = new QueueBillingAlertUseCase(
    { notificationContext } as unknown as BillingRepository,
    { enqueue } as unknown as NotificationOutbox,
    { enqueue: enqueueInApp } as unknown as InAppNotificationRepository,
  );

  return { useCase, notificationContext, enqueue, enqueueInApp };
}

describe('QueueBillingAlertUseCase', () => {
  it('ignores unrelated events without reading notification context', async () => {
    const f = fixture();

    await f.useCase.execute('org', { ...event, type: 'invoice.paid' });

    expect(f.notificationContext).not.toHaveBeenCalled();
    expect(f.enqueue).not.toHaveBeenCalled();
    expect(f.enqueueInApp).not.toHaveBeenCalled();
  });

  it('suppresses alerts for disabled recipients and invoices no longer requiring payment', async () => {
    const f = fixture();
    f.notificationContext
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...context, recipientEnabled: false })
      .mockResolvedValueOnce({ ...context, invoiceStatus: 'paid' })
      .mockResolvedValueOnce({ ...context, amountRemaining: 0 });

    for (let index = 0; index < 4; index++) {
      await f.useCase.execute('org', event);
    }

    expect(f.enqueue).not.toHaveBeenCalled();
    expect(f.enqueueInApp).not.toHaveBeenCalled();
  });

  it.each([
    ['invoice.payment_failed', 'PAYMENT_FAILED'],
    ['invoice.payment_action_required', 'PAYMENT_ACTION_REQUIRED'],
    ['customer.subscription.deleted', 'SUBSCRIPTION_CANCELED'],
  ])('queues scoped email and in-app alerts for %s', async (type, alert) => {
    const f = fixture();
    f.notificationContext.mockResolvedValueOnce({ ...context, subscriptionStatus: 'CANCELED' });

    await f.useCase.execute('org', { ...event, type });

    expect(f.notificationContext).toHaveBeenCalledWith('org', event.stripeObjectId);
    expect(f.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      key: `billing/${alert}/${event.stripeObjectId}`,
      recipient: context.recipient,
      content: { type: alert, organizationName: context.organizationName },
    }));
    expect(f.enqueueInApp).toHaveBeenCalledWith(expect.objectContaining({
      key: `billing-alert/${alert}/${event.stripeObjectId}`,
      organizationId: 'org',
      userId: context.recipientUserId,
      type: alert,
    }));
  });

  it('ignores stale subscription deletion when the current subscription is active', async () => {
    const f = fixture();

    await f.useCase.execute('org', { ...event, type: 'customer.subscription.deleted' });

    expect(f.enqueue).not.toHaveBeenCalled();
    expect(f.enqueueInApp).not.toHaveBeenCalled();
  });
});
