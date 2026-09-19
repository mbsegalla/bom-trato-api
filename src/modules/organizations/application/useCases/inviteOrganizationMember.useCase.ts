import { randomUUID } from 'node:crypto';

import { normalizeEmail } from '../../../../shared/text/email.js';
import { OrganizationInvitation } from '../../domain/entities/organizationInvitation.entity.js';
import type { OrganizationInvitationTokens } from '../ports/organizationInvitationSecurity.port.js';
import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';
import type { InviteMemberParams } from '../types/organization.types.js';

export class InviteOrganizationMemberUseCase {
  constructor(
    private readonly tokens: OrganizationInvitationTokens,
    private readonly processor: OrganizationTeamApplicationService,
  ) {}

  async execute(params: InviteMemberParams) {
    const token = this.tokens.create();

    return this.processor.withTeam(params, async (tx, policy) => {
      policy.assertOwner();

      const now = new Date();
      const email = normalizeEmail(params.email);

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

      const state = invitation.snapshot();

      await tx.notifications.enqueue({
        key: `invitation/${state.id}/${token.hash}`,
        recipient: state.email,
        content: {
          type: 'ORGANIZATION_INVITATION',
          organizationName: tx.organization.name,
          token: token.value,
        },
        expiresAt: state.expiresAt,
      });

      return {
        invitation: invitation.toPublic(now),
        emailQueued: true,
      };
    });
  }
}
