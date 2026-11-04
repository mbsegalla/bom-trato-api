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

const emailDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});

function formatBrl(amountInCents: number): string {
  if (!Number.isSafeInteger(amountInCents) || amountInCents < 0) {
    throw new Error('INVALID_NOTIFICATION_AMOUNT');
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amountInCents / 100);
}

function templateVariables(input: EnqueueNotification, frontendUrl: string): NotificationTemplateVariables {
  const { content, expiresAt } = input;
  const homeUrl = frontendLink(frontendUrl, '/');

  switch (content.type) {
    case 'VERIFY_EMAIL':
      return {
        ACTION_URL: frontendLink(frontendUrl, '/verify-email', content.token),
        EXPIRES_AT: emailDateFormatter.format(expiresAt),
      };

    case 'RESET_PASSWORD':
      return {
        ACTION_URL: frontendLink(frontendUrl, '/reset-password', content.token),
        EXPIRES_AT: emailDateFormatter.format(expiresAt),
      };

    case 'PASSWORD_CHANGED':
      return {
        ACTION_URL: homeUrl,
      };

    case 'ORGANIZATION_INVITATION':
      return {
        ACTION_URL: frontendLink(frontendUrl, '/organization-invitations/accept', content.token),
        ORGANIZATION_NAME: content.organizationName,
        EXPIRES_AT: emailDateFormatter.format(expiresAt),
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

      if (currency.toLowerCase() !== 'brl') {
        throw new Error('INVALID_NOTIFICATION_AMOUNT');
      }

      const amount = formatBrl(amountPaidInCents);

      return {
        ACTION_URL: homeUrl,
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

    case 'REVIEW_REQUEST':
      return {
        ACTION_URL: frontendLink(frontendUrl, '/avaliar', content.token),
        CUSTOMER_NAME: content.customerName,
        ORGANIZATION_NAME: content.organizationName,
        WORK_ORDER_TITLE: content.workOrderTitle,
        EXPIRES_AT: emailDateFormatter.format(expiresAt),
      };

    case 'QUOTE_FOLLOW_UP':
      return {
        ACTION_URL: frontendLink(frontendUrl, '/quote-share', content.token),
        CUSTOMER_NAME: content.customerName,
        ORGANIZATION_NAME: content.organizationName,
        QUOTE_TITLE: content.quoteTitle,
        EXPIRES_AT: emailDateFormatter.format(expiresAt),
      };

    case 'WORK_ORDER_REMINDER':
      return {
        CUSTOMER_NAME: content.customerName,
        ORGANIZATION_NAME: content.organizationName,
        WORK_ORDER_TITLE: content.workOrderTitle,
        SCHEDULED_AT: emailDateFormatter.format(new Date(content.scheduledStartAt)),
      };

    case 'RECEIVABLE_DUE_SOON':
    case 'RECEIVABLE_OVERDUE':
      return {
        CUSTOMER_NAME: content.customerName,
        ORGANIZATION_NAME: content.organizationName,
        RECEIVABLE_TITLE: content.receivableTitle,
        AMOUNT_DUE: formatBrl(content.amountDueInCents),
        DUE_AT: emailDateFormatter.format(new Date(content.dueAt)),
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
