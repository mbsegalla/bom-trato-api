import type { BillingSuccessNotificationUnitOfWork } from '../ports/billingSuccessNotificationUnitOfWork.port.js';

export class QueueNextBillingConfirmationUseCase {
  constructor(private readonly unitOfWork: BillingSuccessNotificationUnitOfWork) {}

  execute(): Promise<boolean> {
    return this.unitOfWork.run(async (tx) => {
      const { billingSuccessNotification } = tx;
      const { recipient } = billingSuccessNotification;

      if (!recipient.enabled) {
        return;
      }

      const occurredAt =
        billingSuccessNotification.kind === 'INVOICE'
          ? billingSuccessNotification.paidAt
          : billingSuccessNotification.appliedAt;

      if (occurredAt === null) {
        return;
      }

      const expiresAt = new Date(occurredAt.getTime() + 24 * 60 * 60 * 1000);

      if (expiresAt.getTime() <= Date.now()) {
        return;
      }

      if (billingSuccessNotification.kind === 'PLAN_CHANGE') {
        await tx.notificationOutbox.enqueue({
          key: `plan-change-applied/${billingSuccessNotification.id}`,
          recipient: recipient.email,
          expiresAt,
          content: {
            type: 'PLAN_CHANGE_CONFIRMED',
            organizationName: recipient.organizationName,
            planName: billingSuccessNotification.planName,
          },
        });

        return;
      }

      const subscriptionIsActive =
        billingSuccessNotification.subscriptionStatus === 'ACTIVE' ||
        billingSuccessNotification.subscriptionStatus === 'TRIALING';

      const activation = billingSuccessNotification.billingReason === 'subscription_create' && subscriptionIsActive;

      await tx.notificationOutbox.enqueue({
        key: `invoice-paid/${billingSuccessNotification.stripeInvoiceId}`,
        recipient: recipient.email,
        expiresAt,
        content: {
          type: activation ? 'SUBSCRIPTION_ACTIVATED' : 'PAYMENT_CONFIRMED',
          organizationName: recipient.organizationName,
          invoiceNumber: billingSuccessNotification.number,
          amountPaidInCents: billingSuccessNotification.amountPaid,
          currency: billingSuccessNotification.currency,
        },
      });
    });
  }
}
