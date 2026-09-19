import type { RenderedNotificationEmail } from '../../application/types/notification.types.js';

import { emailLayout } from './emailLayout.template.js';
import { escapeHtml } from './escapeHtml.js';

export function subscriptionCanceledTemplate(actionUrl: string, organizationName: string): RenderedNotificationEmail {
  return emailLayout({
    subject: 'Sua assinatura foi cancelada',
    actionUrl,
    actionLabel: 'Consultar assinatura',
    bodyHtml: `
      <p style="line-height:1.6">
        A assinatura de
        <strong>${escapeHtml(organizationName)}</strong>
        foi cancelada.
      </p>

      <p style="line-height:1.6">
        Acesse o Bom Trato para consultar a situação da organização
        e as opções disponíveis.
      </p>

      <p style="line-height:1.6;color:#626b75">
        Se você já contratou uma nova assinatura, confira os dados atuais
        na aplicação.
      </p>
    `,
    text: [
      `A assinatura de ${organizationName} foi cancelada.`,
      'Acesse o Bom Trato para consultar a situação da organização e as opções disponíveis.',
      'Se você já contratou uma nova assinatura, confira os dados atuais na aplicação.',
    ].join('\n\n'),
  });
}
