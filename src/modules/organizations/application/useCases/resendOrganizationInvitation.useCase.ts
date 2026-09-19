import type { OrganizationInvitationTokens } from '../ports/organizationInvitationSecurity.port.js';
import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';
import type { InvitationActionParams } from '../types/organization.types.js';

export class ResendOrganizationInvitationUseCase {
  constructor(
    private readonly tokens: OrganizationInvitationTokens,
    private readonly processor: OrganizationTeamApplicationService,
  ) {}

  async execute(params: InvitationActionParams) {
    const { invitationId } = params;

    const token = this.tokens.create();

    return this.processor.withTeam(params, async (tx, policy) => {
      policy.assertOwner();

      const now = new Date();
      const invitation = await this.processor.find(tx, invitationId);

      const email = invitation.snapshot().email;

      await this.processor.assertCanInvite(tx, policy, email, now);

      await this.processor.clearExpiredInvitation(tx, email, now, invitationId);

      invitation.resend(token.hash, tx.actor.id, now);

      await tx.invitationRateLimit.consume({
        organizationId: tx.organization.id,
        now,
      });

      await tx.invitations.save(invitation);

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
