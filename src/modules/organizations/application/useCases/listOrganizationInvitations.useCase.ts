import { OrganizationInvitation } from '../../domain/entities/organizationInvitation.entity.js';
import type { InvitationPageParams } from '../../domain/repositories/organizationInvitation.repository.js';
import type { OrganizationActorParams } from '../ports/organizationUnitOfWork.port.js';
import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';

export class ListOrganizationInvitationsUseCase {
  constructor(private readonly processor: OrganizationTeamApplicationService) {}

  execute(params: OrganizationActorParams, page: InvitationPageParams) {
    return this.processor.withTeam(params, async (tx, policy) => {
      policy.assertOwner();

      const now = new Date();

      const result = await tx.invitations.list({
        ...page,
        organizationId: tx.organization.id,
        now,
      });

      return {
        ...result,
        items: result.items.map((row) => OrganizationInvitation.restore(row).toPublic(now)),
      };
    });
  }
}
