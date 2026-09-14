import type { ConfigType } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';

import type { appConfig } from '../../config/app.config.js';
import type { mailConfig } from '../../config/mail.config.js';

interface SmtpMessage {
  to: string;
  subject: string;
  text: string;
}

export class SmtpTransport {
  private readonly transport: Transporter<SMTPTransport.SentMessageInfo>;

  constructor(
    private readonly config: ConfigType<typeof mailConfig>,
    app: ConfigType<typeof appConfig>,
  ) {
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

  async send(message: SmtpMessage): Promise<boolean> {
    const result = await this.transport.sendMail({
      from: {
        name: this.config.from.name,
        address: this.config.from.email,
      },
      ...message,
    });

    return result.accepted.length > 0;
  }
}
