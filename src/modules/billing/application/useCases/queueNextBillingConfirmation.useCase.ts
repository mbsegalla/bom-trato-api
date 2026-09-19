import type { BillingSuccessNotificationUnitOfWork } from '../ports/prismaBillingSuccessNotificationUnitOfWork.port.js';

export class QueueNextBillingConfirmationUseCase {
  constructor(private readonly unitOfWork: BillingSuccessNotificationUnitOfWork) {}

  execute(): Promise<boolean> {
    return this.unitOfWork.run(async (tx) => {
      const { BillingSuccessNotification } = tx;
      const { recipient } = BillingSuccessNotification;

      if (!recipient.enabled) {
        return;
      }

      const occurredAt =
        BillingSuccessNotification.kind === 'INVOICE'
          ? BillingSuccessNotification.paidAt
          : BillingSuccessNotification.appliedAt;

      if (occurredAt === null) {
        return;
      }

      const expiresAt = new Date(occurredAt.getTime() + 24 * 60 * 60 * 1000);

      if (expiresAt.getTime() <= Date.now()) {
        return;
      }

      if (BillingSuccessNotification.kind === 'PLAN_CHANGE') {
        await tx.notificationOutbox.enqueue({
          key: `plan-change-applied/${BillingSuccessNotification.id}`,
          recipient: recipient.email,
          expiresAt,
          content: {
            type: 'PLAN_CHANGE_CONFIRMED',
            organizationName: recipient.organizationName,
            planName: BillingSuccessNotification.planName,
          },
        });

        return;
      }

      const subscriptionIsActive =
        BillingSuccessNotification.subscriptionStatus === 'ACTIVE' ||
        BillingSuccessNotification.subscriptionStatus === 'TRIALING';

      const activation = BillingSuccessNotification.billingReason === 'subscription_create' && subscriptionIsActive;

      await tx.notificationOutbox.enqueue({
        key: `invoice-paid/${BillingSuccessNotification.stripeInvoiceId}`,
        recipient: recipient.email,
        expiresAt,
        content: {
          type: activation ? 'SUBSCRIPTION_ACTIVATED' : 'PAYMENT_CONFIRMED',
          organizationName: recipient.organizationName,
          invoiceNumber: BillingSuccessNotification.number,
          amountPaidInCents: BillingSuccessNotification.amountPaid,
          currency: BillingSuccessNotification.currency,
        },
      });
    });
  }
}
