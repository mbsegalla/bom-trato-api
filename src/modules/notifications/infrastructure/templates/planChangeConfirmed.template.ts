import type { PlanChangeNotification, RenderedNotificationEmail } from '../../application/types/notification.types.js';

import { emailLayout } from './emailLayout.template.js';
import { escapeHtml } from './escapeHtml.js';

export function planChangeConfirmedTemplate(
  actionUrl: string,
  data: PlanChangeNotification,
): RenderedNotificationEmail {
  const { organizationName, planName } = data;

  return emailLayout({
    subject: 'Sua mudança de plano foi aplicada',
    actionUrl,
    actionLabel: 'Consultar meu plano',
    bodyHtml: `
      <p style="line-height:1.6">
        A mudança de plano de
        <strong>${escapeHtml(organizationName)}</strong>
        foi aplicada.
      </p>

      <p style="line-height:1.6">
        Plano de destino:
        <strong>${escapeHtml(planName)}</strong>.
      </p>

      <p style="line-height:1.6">
        Acesse o Bom Trato para consultar os recursos disponíveis
        e os detalhes de faturamento.
      </p>

      <p style="line-height:1.6;color:#626b75">
        Esta mensagem confirma a aplicação da mudança.
        Eventuais pagamentos são confirmados separadamente.
      </p>
    `,
    text: [
      `A mudança de plano de ${organizationName} foi aplicada.`,
      `Plano de destino: ${planName}.`,
      'Acesse o Bom Trato para consultar os recursos disponíveis e os detalhes de faturamento.',
      'Esta mensagem confirma a aplicação da mudança. Eventuais pagamentos são confirmados separadamente.',
    ].join('\n\n'),
  });
}
