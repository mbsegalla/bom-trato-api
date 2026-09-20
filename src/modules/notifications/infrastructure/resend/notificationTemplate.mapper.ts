import type {
  EnqueueNotification,
  NotificationContent,
  NotificationMessage,
  NotificationTemplateVariables,
} from '../../application/types/notification.types.js';

function frontendLink(frontendUrl: string, path: string, token?: string): string {
  const url = new URL(path, frontendUrl);

  if (token !== undefined) {
    url.hash = new URLSearchParams({ token }).toString();
  }

  return url.toString();
}

function templateVariables(input: EnqueueNotification, frontendUrl: string): NotificationTemplateVariables {
  const { content, expiresAt } = input;
  const homeUrl = frontendLink(frontendUrl, '/');

  switch (content.type) {
    case 'VERIFY_EMAIL':
      return {
        ACTION_URL: frontendLink(frontendUrl, '/verify-email', content.token),
        EXPIRES_AT: expiresAt.toISOString(),
      };

    case 'RESET_PASSWORD':
      return {
        ACTION_URL: frontendLink(frontendUrl, '/reset-password', content.token),
        EXPIRES_AT: expiresAt.toISOString(),
      };

    case 'PASSWORD_CHANGED':
      return {
        ACTION_URL: homeUrl,
      };

    case 'ORGANIZATION_INVITATION':
      return {
        ACTION_URL: frontendLink(frontendUrl, '/organization-invitations/accept', content.token),
        ORGANIZATION_NAME: content.organizationName,
        EXPIRES_AT: expiresAt.toISOString(),
      };

    case 'PAYMENT_FAILED':
    case 'PAYMENT_ACTION_REQUIRED':
    case 'SUBSCRIPTION_CANCELED':
      return {
        ACTION_URL: homeUrl,
        ORGANIZATION_NAME: content.organizationName,
      };

    case 'SUBSCRIPTION_ACTIVATED':
    case 'PAYMENT_CONFIRMED': {
      const { amountPaidInCents, currency } = content;

      if (currency.toLowerCase() !== 'brl' || !Number.isSafeInteger(amountPaidInCents) || amountPaidInCents < 0) {
        throw new Error('INVALID_NOTIFICATION_AMOUNT');
      }

      const amount = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(amountPaidInCents / 100);

      return {
        ACTION_URL: homeUrl,
        ORGANIZATION_NAME: content.organizationName,
        INVOICE_NUMBER: content.invoiceNumber ?? 'Não informado',
        AMOUNT_PAID: amount,
        PAYMENT_DESCRIPTION:
          amountPaidInCents === 0
            ? 'A fatura foi quitada sem valor pago registrado.'
            : `Valor registrado como pago na fatura: ${amount}.`,
      };
    }

    case 'PLAN_CHANGE_CONFIRMED':
      return {
        ACTION_URL: homeUrl,
        ORGANIZATION_NAME: content.organizationName,
        PLAN_NAME: content.planName,
      };
  }
}

export function mapNotificationTemplate(
  input: EnqueueNotification,
  frontendUrl: string,
  from: string,
  templates: Record<NotificationContent['type'], string>,
): NotificationMessage {
  return {
    from,
    to: input.recipient,
    template: {
      id: templates[input.content.type],
      variables: templateVariables(input, frontendUrl),
    },
  };
}
