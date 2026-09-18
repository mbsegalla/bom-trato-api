import { OrganizationTeamError } from '../../domain/errors/organizationTeam.error.js';
import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';
import type { RemoveMemberParams } from '../types/organization.types.js';

export class RemoveOrganizationMemberUseCase {
  constructor(private readonly processor: OrganizationTeamApplicationService) {}

  async execute(params: RemoveMemberParams): Promise<void> {
    await this.processor.withTeam(params, async (tx, policy) => {
      policy.assertOwner();

      const lookup = {
        organizationId: tx.organization.id,
        memberId: params.memberId,
      };

      const member = await tx.members.findById(lookup);

      if (member === null) {
        throw new OrganizationTeamError('MEMBER_NOT_FOUND');
      }

      policy.assertCanRemove(member.userId, member.role);

      await tx.invitations.invalidateAcceptedTokens({
        organizationId: tx.organization.id,
        userId: member.userId,
      });

      await tx.members.remove(lookup);
    });
  }
}
