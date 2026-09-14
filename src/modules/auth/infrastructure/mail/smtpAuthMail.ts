import { Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import type { appConfig } from '../../../../config/app.config.js';
import type { SmtpTransport } from '../../../../infrastructure/mail/smtpTransport.js';
import { AuthMail } from '../../application/ports/authSecurity.port.js';

export class SmtpAuthMail extends AuthMail {
  private readonly logger = new Logger(SmtpAuthMail.name);

  constructor(
    private readonly transport: SmtpTransport,
    private readonly app: ConfigType<typeof appConfig>,
  ) {
    super();
  }

  async sendVerification(email: string, token: string): Promise<void> {
    await this.send(email, token, '/verify-email', 'Verify your Bom Trato email');
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    await this.send(email, token, '/reset-password', 'Reset your Bom Trato password');
  }

  private async send(email: string, token: string, path: string, subject: string): Promise<void> {
    const url = new URL(path, this.app.frontendUrl);

    url.hash = new URLSearchParams({ token }).toString();

    try {
      await this.transport.send({
        to: email,
        subject,
        text: [
          subject,
          '',
          `Open this link: ${url.toString()}`,
          '',
          'If you did not request this, ignore this email.',
        ].join('\n'),
      });
    } catch {
      this.logger.error('Authentication email delivery failed');
    }
  }
}
