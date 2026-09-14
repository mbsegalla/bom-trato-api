import { Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import type { appConfig } from '../../../../config/app.config.js';
import type { SmtpTransport } from '../../../../infrastructure/mail/smtpTransport.js';
import type { SendInvitationParams } from '../../application/ports/organizationInvitationSecurity.port.js';
import { OrganizationInvitationMail } from '../../application/ports/organizationInvitationSecurity.port.js';

export class SmtpOrganizationInvitationMail extends OrganizationInvitationMail {
  private readonly logger = new Logger(SmtpOrganizationInvitationMail.name);

  constructor(
    private readonly transport: SmtpTransport,
    private readonly app: ConfigType<typeof appConfig>,
  ) {
    super();
  }

  async send({ email, organizationName, token }: SendInvitationParams): Promise<boolean> {
    const url = new URL('/organization-invitations/accept', this.app.frontendUrl);

    url.hash = new URLSearchParams({ token }).toString();

    try {
      return await this.transport.send({
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
    } catch {
      this.logger.error('Organization invitation email delivery failed');

      return false;
    }
  }
}
