import { Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import nodemailer from 'nodemailer';

import type { appConfig } from '../../../../config/app.config.js';
import type { mailConfig } from '../../../../config/mail.config.js';
import type { SendInvitationParams } from '../../application/ports/organizationInvitationSecurity.port.js';
import { OrganizationInvitationMail } from '../../application/ports/organizationInvitationSecurity.port.js';

export class SmtpOrganizationInvitationMail extends OrganizationInvitationMail {
  private readonly logger = new Logger(SmtpOrganizationInvitationMail.name);

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

  async send({ email, organizationName, token }: SendInvitationParams): Promise<boolean> {
    const url = new URL('/organization-invitations/accept', this.app.frontendUrl);

    url.hash = new URLSearchParams({ token }).toString();

    try {
      const result = await this.transport.sendMail({
        from: {
          name: this.config.from.name,
          address: this.config.from.email,
        },
        to: email,
        subject: 'Invitation to join a Bom Trato organization',
        text: [
          `You were invited to join ${organizationName}.`,
          '',
          `Open this link: ${url.toString()}`,
          '',
          'Sign in with the email address that received this invitation.',
          'This invitation expires in 48 hours.',
          'If you did not expect this invitation, ignore this email.',
        ].join('\n'),
      });

      return result.accepted.length > 0;
    } catch {
      this.logger.error('Organization invitation email delivery failed');

      return false;
    }
  }
}
