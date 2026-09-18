import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';
import type { InvitationActionParams } from '../types/organization.types.js';

export class RevokeOrganizationInvitationUseCase {
  constructor(private readonly processor: OrganizationTeamApplicationService) {}

  async execute(params: InvitationActionParams): Promise<void> {
    await this.processor.withTeam(params, async (tx, policy) => {
      policy.assertOwner();

      const invitation = await this.processor.find(tx, params.invitationId);

      invitation.revoke(new Date());

      await tx.invitations.save(invitation);
    });
  }
}
