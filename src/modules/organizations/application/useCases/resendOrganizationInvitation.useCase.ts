import type {
  OrganizationInvitationMail,
  OrganizationInvitationTokens,
} from '../ports/organizationInvitationSecurity.port.js';
import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';
import type { InvitationActionParams } from '../types/manageOrganizationTeam.types.js';
export class ResendOrganizationInvitationUseCase {
  constructor(
    private readonly tokens: OrganizationInvitationTokens,
    private readonly mail: OrganizationInvitationMail,
    private readonly processor: OrganizationTeamApplicationService,
  ) {}
  async execute(params: InvitationActionParams) {
    const token = this.tokens.create();

    const result = await this.processor.withTeam(params, async (tx, policy) => {
      policy.assertOwner();

      const now = new Date();
      const invitation = await this.processor.find(tx, params.invitationId);
      const email = invitation.snapshot().email;

      await this.processor.assertCanInvite(tx, policy, email, now);

      await this.processor.clearExpiredInvitation(tx, email, now, params.invitationId);

      invitation.resend(token.hash, tx.actor.id, now);

      await tx.invitationRateLimit.consume({
        organizationId: tx.organization.id,
        now,
      });

      await tx.invitations.save(invitation);

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
