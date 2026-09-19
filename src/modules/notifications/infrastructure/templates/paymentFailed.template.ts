import type { RenderedNotificationEmail } from '../../application/types/notification.types.js';

import { emailLayout } from './emailLayout.template.js';
import { escapeHtml } from './escapeHtml.js';

export function paymentFailedTemplate(actionUrl: string, organizationName: string): RenderedNotificationEmail {
  return emailLayout({
    subject: 'Não foi possível concluir sua cobrança',
    actionUrl,
    actionLabel: 'Consultar minha assinatura',
    bodyHtml: `
      <p style="line-height:1.6">
        Uma tentativa de pagamento da assinatura de
        <strong>${escapeHtml(organizationName)}</strong> falhou.
      </p>

      <p style="line-height:1.6">
        Acesse o Bom Trato para consultar a cobrança e revisar sua forma
        de pagamento.
      </p>

      <p style="line-height:1.6;color:#626b75">
        Se você já regularizou o pagamento, consulte a situação atual
        da assinatura na aplicação.
      </p>
    `,
    text: [
      `Uma tentativa de pagamento da assinatura de ${organizationName} falhou.`,
      'Acesse o Bom Trato para consultar a cobrança e revisar sua forma de pagamento.',
      'Se você já regularizou o pagamento, consulte a situação atual da assinatura na aplicação.',
    ].join('\n\n'),
  });
}
