import type { RenderedNotificationEmail } from '../../application/types/notification.types.js';

import { emailLayout } from './emailLayout.template.js';

export function passwordChangedTemplate(actionUrl: string): RenderedNotificationEmail {
  return emailLayout({
    subject: 'Sua senha do Bom Trato foi alterada',
    actionUrl,
    actionLabel: 'Acessar minha conta',
    bodyHtml: `
      <p style="line-height:1.6">
        A senha da sua conta foi alterada.
        As sessões anteriores foram revogadas.
      </p>

      <p style="line-height:1.6">
        Se você realizou esta alteração, nenhuma ação adicional é necessária.
      </p>

      <p style="line-height:1.6">
        <strong>Não reconhece esta alteração?</strong>
        Acesse o Bom Trato e solicite a recuperação da sua conta.
      </p>
    `,
    text: [
      'A senha da sua conta foi alterada. As sessões anteriores foram revogadas.',
      'Se você realizou esta alteração, nenhuma ação adicional é necessária.',
      'Se você não reconhece esta alteração, acesse o Bom Trato e solicite a recuperação da sua conta.',
    ].join('\n\n'),
  });
}
