import type { EmailLayoutParams, RenderedNotificationEmail } from '../../application/types/notification.types.js';

import { escapeHtml } from './escapeHtml.js';

export function emailLayout(params: EmailLayoutParams): RenderedNotificationEmail {
  const { subject, bodyHtml, text, actionUrl, actionLabel } = params;

  const html = `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(subject)}</title>
    </head>
    <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#20242a">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center" style="padding:32px 16px">
            <table
              role="presentation"
              width="100%"
              cellspacing="0"
              cellpadding="0"
              style="max-width:560px;background:#ffffff;border-radius:12px"
            >
              <tr>
                <td style="padding:32px">
                  <p style="margin:0 0 24px;font-weight:bold;color:#245d49">
                    Bom Trato
                  </p>

                  <h1 style="margin:0 0 24px;font-size:24px;line-height:1.3">
                    ${escapeHtml(subject)}
                  </h1>

                  ${bodyHtml}

                  <p style="margin:28px 0">
                    <a
                      href="${escapeHtml(actionUrl)}"
                      style="display:inline-block;background:#245d49;color:#ffffff;padding:14px 20px;border-radius:6px;text-decoration:none;font-weight:bold"
                    >
                      ${escapeHtml(actionLabel)}
                    </a>
                  </p>

                  <p style="font-size:12px;line-height:1.5;color:#626b75">
                    Se o botão não funcionar, copie e cole este endereço no navegador:
                  </p>

                  <p style="font-size:12px;line-height:1.5;word-break:break-all;color:#626b75">
                    ${escapeHtml(actionUrl)}
                  </p>

                  <hr style="margin:28px 0;border:0;border-top:1px solid #e5e7eb">

                  <p style="margin:0;font-size:12px;color:#626b75">
                    Mensagem automática do Bom Trato.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;

  return {
    subject,
    html,
    text: [subject, text, `${actionLabel}: ${actionUrl}`, 'Mensagem automática do Bom Trato.'].join('\n\n'),
  };
}
