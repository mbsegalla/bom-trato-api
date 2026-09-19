import type {
  BillingPaymentNotification,
  RenderedNotificationEmail,
} from '../../application/types/notification.types.js';

import { emailLayout } from './emailLayout.template.js';
import { escapeHtml } from './escapeHtml.js';
import { formatBillingAmount } from './formatBillingAmount.js';

export function paymentConfirmedTemplate(
  actionUrl: string,
  data: BillingPaymentNotification,
): RenderedNotificationEmail {
  const { amountPaidInCents, currency, invoiceNumber, organizationName } = data;

  const amount = formatBillingAmount(amountPaidInCents, currency);

  const subject = amountPaidInCents === 0 ? 'Sua fatura do Bom Trato foi quitada' : 'Pagamento confirmado no Bom Trato';

  const paymentDescription =
    amountPaidInCents === 0
      ? 'A fatura foi quitada sem valor pago registrado.'
      : `Valor registrado como pago na fatura: ${amount}.`;

  const invoiceDescription = invoiceNumber === null ? '' : `Fatura: ${invoiceNumber}.`;

  return emailLayout({
    subject,
    actionUrl,
    actionLabel: 'Consultar assinatura',
    bodyHtml: `
      <p style="line-height:1.6">
        Confirmamos a quitação de uma fatura da assinatura de
        <strong>${escapeHtml(organizationName)}</strong>.
      </p>

      <p style="line-height:1.6">
        ${escapeHtml(paymentDescription)}
      </p>

      ${invoiceDescription ? `<p style="line-height:1.6">${escapeHtml(invoiceDescription)}</p>` : ''}

      <p style="line-height:1.6">
        Consulte a aplicação para visualizar a fatura e a situação
        atual da assinatura.
      </p>
    `,
    text: [
      `Confirmamos a quitação de uma fatura da assinatura de ${organizationName}.`,
      paymentDescription,
      invoiceDescription,
      'Consulte a aplicação para visualizar a fatura e a situação atual da assinatura.',
    ]
      .filter(Boolean)
      .join('\n\n'),
  });
}
