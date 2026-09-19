import type { RenderedNotificationEmail } from '../../application/types/notification.types.js';

import { emailLayout } from './emailLayout.template.js';
import { escapeHtml } from './escapeHtml.js';

export function verifyEmailTemplate(actionUrl: string, expiresAt: Date): RenderedNotificationEmail {
  const expiration = expiresAt.toISOString();

  return emailLayout({
    subject: 'Confirme seu e-mail no Bom Trato',
    actionUrl,
    actionLabel: 'Confirmar e-mail',
    bodyHtml: `
      <p style="line-height:1.6">
        Confirme seu endereço de e-mail para continuar usando o Bom Trato.
      </p>

      <p style="line-height:1.6">
        Este link expira em <strong>${escapeHtml(expiration)} (UTC)</strong>.
      </p>

      <p style="line-height:1.6;color:#626b75">
        Se você não criou esta conta, ignore esta mensagem.
      </p>
    `,
    text: [
      'Confirme seu endereço de e-mail para continuar usando o Bom Trato.',
      `Este link expira em ${expiration} (UTC).`,
      'Se você não criou esta conta, ignore esta mensagem.',
    ].join('\n\n'),
  });
}
