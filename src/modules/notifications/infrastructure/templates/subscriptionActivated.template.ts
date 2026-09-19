import type {
  BillingPaymentNotification,
  RenderedNotificationEmail,
} from '../../application/types/notification.types.js';

import { emailLayout } from './emailLayout.template.js';
import { escapeHtml } from './escapeHtml.js';
import { formatBillingAmount } from './formatBillingAmount.js';

export function subscriptionActivatedTemplate(
  actionUrl: string,
  data: BillingPaymentNotification,
): RenderedNotificationEmail {
  const { amountPaidInCents, currency, invoiceNumber, organizationName } = data;

  const amount = formatBillingAmount(amountPaidInCents, currency);

  const paymentDescription =
    amountPaidInCents === 0
      ? 'A fatura inicial foi quitada sem valor pago registrado.'
      : `Valor registrado como pago na fatura inicial: ${amount}.`;

  const invoiceDescription = invoiceNumber === null ? '' : `Fatura: ${invoiceNumber}.`;

  return emailLayout({
    subject: 'Sua assinatura do Bom Trato está confirmada',
    actionUrl,
    actionLabel: 'Acessar Bom Trato',
    bodyHtml: `
      <p style="line-height:1.6">
        A assinatura de
        <strong>${escapeHtml(organizationName)}</strong>
        está confirmada.
      </p>

      <p style="line-height:1.6">
        ${escapeHtml(paymentDescription)}
      </p>

      ${invoiceDescription ? `<p style="line-height:1.6">${escapeHtml(invoiceDescription)}</p>` : ''}

      <p style="line-height:1.6">
        Acesse a aplicação para consultar os detalhes da assinatura
        e começar a utilizar os recursos disponíveis.
      </p>
    `,
    text: [
      `A assinatura de ${organizationName} está confirmada.`,
      paymentDescription,
      invoiceDescription,
      'Acesse a aplicação para consultar os detalhes da assinatura e utilizar os recursos disponíveis.',
    ]
      .filter(Boolean)
      .join('\n\n'),
  });
}
