import type { RenderedNotificationEmail } from '../../application/types/notification.types.js';

import { emailLayout } from './emailLayout.template.js';
import { escapeHtml } from './escapeHtml.js';

export function resetPasswordTemplate(actionUrl: string, expiresAt: Date): RenderedNotificationEmail {
  const expiration = expiresAt.toISOString();

  return emailLayout({
    subject: 'Redefina sua senha do Bom Trato',
    actionUrl,
    actionLabel: 'Redefinir senha',
    bodyHtml: `
      <p style="line-height:1.6">
        Recebemos uma solicitação para redefinir a senha da sua conta.
      </p>

      <p style="line-height:1.6">
        Use o botão abaixo para escolher uma nova senha.
        Este link expira em <strong>${escapeHtml(expiration)} (UTC)</strong>.
      </p>

      <p style="line-height:1.6;color:#626b75">
        Se você não solicitou esta alteração, ignore esta mensagem.
        Sua senha permanece a mesma.
      </p>
    `,
    text: [
      'Recebemos uma solicitação para redefinir a senha da sua conta.',
      'Acesse o link abaixo para escolher uma nova senha.',
      `Este link expira em ${expiration} (UTC).`,
      'Se você não solicitou esta alteração, ignore esta mensagem. Sua senha permanece a mesma.',
    ].join('\n\n'),
  });
}
