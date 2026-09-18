import { randomUUID } from 'node:crypto';

import { OrganizationInvitation } from '../../domain/entities/organizationInvitation.entity.js';
import type {
  OrganizationInvitationMail,
  OrganizationInvitationTokens,
} from '../ports/organizationInvitationSecurity.port.js';
import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';
import type { InviteMemberParams } from '../types/organization.types.js';

export class InviteOrganizationMemberUseCase {
  constructor(
    private readonly tokens: OrganizationInvitationTokens,
    private readonly mail: OrganizationInvitationMail,
    private readonly processor: OrganizationTeamApplicationService,
  ) {}

  async execute(params: InviteMemberParams) {
    const token = this.tokens.create();

    const result = await this.processor.withTeam(params, async (tx, policy) => {
      policy.assertOwner();

      const now = new Date();
      const email = params.email.trim().toLowerCase();

      await this.processor.assertCanInvite(tx, policy, email, now);
      await this.processor.clearExpiredInvitation(tx, email, now);

      await tx.invitationRateLimit.consume({
        organizationId: tx.organization.id,
        now,
      });

      const invitation = OrganizationInvitation.create({
        id: randomUUID(),
        organizationId: tx.organization.id,
        invitedById: tx.actor.id,
        email,
        tokenHash: token.hash,
        now,
      });

      await tx.invitations.create(invitation);

      return {
        invitation: invitation.toPublic(now),
        organizationName: tx.organization.name,
      };
    });

    const emailAccepted = await this.mail.send({
      email: result.invitation.email,
      organizationName: result.organizationName,
      token: token.value,
    });

    return {
      invitation: result.invitation,
      emailAccepted,
    };
  }
}
