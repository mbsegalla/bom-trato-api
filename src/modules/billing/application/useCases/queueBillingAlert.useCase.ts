import type { NotificationOutbox } from '../../../notifications/application/ports/notificationOutbox.port.js';
import type { NotificationContent } from '../../../notifications/application/types/notification.types.js';
import type { InAppNotificationRepository } from '../../../notifications/domain/repositories/inAppNotification.repository.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { WebhookNotice } from '../../domain/types/billing.types.js';

export class QueueBillingAlertUseCase {
  constructor(
    private readonly repository: BillingRepository,
    private readonly notifications: NotificationOutbox,
    private readonly inAppNotifications: InAppNotificationRepository,
  ) {}

  async execute(organizationId: string, event: WebhookNotice): Promise<void> {
    const types = {
      'invoice.payment_failed': 'PAYMENT_FAILED',
      'invoice.payment_action_required': 'PAYMENT_ACTION_REQUIRED',
      'customer.subscription.deleted': 'SUBSCRIPTION_CANCELED',
    } as const;

    if (!(event.type in types)) {
      return;
    }

    const type = types[event.type as keyof typeof types];

    const context = await this.repository.notificationContext(organizationId, event.stripeObjectId);

    if (context === null || !context.recipientEnabled) {
      return;
    }

    if (type === 'SUBSCRIPTION_CANCELED') {
      if (context.subscriptionStatus !== 'CANCELED') {
        return;
      }
    } else if (context.invoiceStatus !== 'open' || context.amountRemaining <= 0) {
      return;
    }

    const content: NotificationContent = {
      type,
      organizationName: context.organizationName,
    };

    await this.notifications.enqueue({
      key: `billing/${type}/${event.stripeObjectId}`,
      recipient: context.recipient,
      content,
      expiresAt: new Date(Date.now() + 86400000),
    });

    const presentation = {
      PAYMENT_FAILED: {
        title: 'Pagamento da assinatura falhou',
        message: `Não foi possível processar o pagamento da assinatura de ${context.organizationName}.`,
      },
      PAYMENT_ACTION_REQUIRED: {
        title: 'Pagamento precisa de atenção',
        message: `Uma ação é necessária para concluir o pagamento da assinatura de ${context.organizationName}.`,
      },
      SUBSCRIPTION_CANCELED: {
        title: 'Assinatura cancelada',
        message: `A assinatura de ${context.organizationName} foi cancelada.`,
      },
    } as const;

    await this.inAppNotifications.enqueue({
      key: `billing-alert/${type}/${event.stripeObjectId}`,
      userId: context.recipientUserId,
      organizationId,
      type,
      title: presentation[type].title,
      message: presentation[type].message,
      href: '/settings?tab=billing',
    });
  }
}
