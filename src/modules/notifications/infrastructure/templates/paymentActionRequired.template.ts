import type { RenderedNotificationEmail } from '../../application/types/notification.types.js';

import { emailLayout } from './emailLayout.template.js';
import { escapeHtml } from './escapeHtml.js';

export function paymentActionRequiredTemplate(actionUrl: string, organizationName: string): RenderedNotificationEmail {
  return emailLayout({
    subject: 'Seu pagamento precisa de confirmação',
    actionUrl,
    actionLabel: 'Consultar pagamento',
    bodyHtml: `
      <p style="line-height:1.6">
        O pagamento da assinatura de
        <strong>${escapeHtml(organizationName)}</strong>
        precisa de uma ação sua.
      </p>

      <p style="line-height:1.6">
        Acesse o Bom Trato para consultar a cobrança e seguir as instruções
        necessárias para concluir o pagamento.
      </p>

      <p style="line-height:1.6;color:#626b75">
        Se você já concluiu essa etapa, consulte a situação atual
        da assinatura na aplicação.
      </p>
    `,
    text: [
      `O pagamento da assinatura de ${organizationName} precisa de uma ação sua.`,
      'Acesse o Bom Trato para consultar a cobrança e seguir as instruções necessárias para concluir o pagamento.',
      'Se você já concluiu essa etapa, consulte a situação atual da assinatura na aplicação.',
    ].join('\n\n'),
  });
}
