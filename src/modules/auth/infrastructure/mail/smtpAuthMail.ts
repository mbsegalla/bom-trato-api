import { Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import nodemailer from 'nodemailer';

import type { appConfig } from '../../../../config/app.config.js';
import type { mailConfig } from '../../../../config/mail.config.js';
import { AuthMail } from '../../application/ports/authSecurity.port.js';

export class SmtpAuthMail extends AuthMail {
  private readonly logger = new Logger(SmtpAuthMail.name);
  private readonly transport;

  constructor(
    private readonly config: ConfigType<typeof mailConfig>,
    private readonly app: ConfigType<typeof appConfig>,
  ) {
    super();

    this.transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      requireTLS: app.isProduction && !config.smtp.secure,
      auth: config.smtp.user
        ? {
            user: config.smtp.user,
            pass: config.smtp.password,
          }
        : undefined,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
  }

  async sendVerification(email: string, token: string): Promise<void> {
    await this.send(email, token, '/verify-email', 'Verify your Bom Trato email');
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    await this.send(email, token, '/reset-password', 'Reset your Bom Trato password');
  }

  private async send(email: string, token: string, path: string, subject: string): Promise<void> {
    const url = new URL(path, this.app.frontendUrl);

    // Fragments are not included in HTTP requests or referrer headers.
    url.hash = new URLSearchParams({ token }).toString();

    try {
      await this.transport.sendMail({
        from: {
          name: this.config.from.name,
          address: this.config.from.email,
        },
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
