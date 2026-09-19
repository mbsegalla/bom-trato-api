import type { RenderedNotificationEmail } from '../../application/types/notification.types.js';

import { emailLayout } from './emailLayout.template.js';
import { escapeHtml } from './escapeHtml.js';

export function organizationInvitationTemplate(
  actionUrl: string,
  organizationName: string,
  expiresAt: Date,
): RenderedNotificationEmail {
  const expiration = expiresAt.toISOString();

  return emailLayout({
    subject: 'Você recebeu um convite no Bom Trato',
    actionUrl,
    actionLabel: 'Consultar convite',
    bodyHtml: `
      <p style="line-height:1.6">
        Você foi convidado para participar de
        <strong>${escapeHtml(organizationName)}</strong>.
      </p>

      <p style="line-height:1.6">
        Para consultar e aceitar o convite, entre com o endereço de e-mail
        que recebeu esta mensagem.
      </p>

      <p style="line-height:1.6">
        O convite expira em <strong>${escapeHtml(expiration)} (UTC)</strong>.
      </p>

      <p style="line-height:1.6;color:#626b75">
        Se você não reconhece esta organização, ignore o convite.
      </p>
    `,
    text: [
      `Você foi convidado para participar de ${organizationName}.`,
      'Para consultar e aceitar o convite, entre com o endereço de e-mail que recebeu esta mensagem.',
      `O convite expira em ${expiration} (UTC).`,
      'Se você não reconhece esta organização, ignore o convite.',
    ].join('\n\n'),
  });
}
