import type { OrganizationPageParams } from '../../domain/types/organizationPagination.types.js';
import type { OrganizationActorParams } from '../ports/organizationUnitOfWork.port.js';
import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';

export class ListOrganizationMembersUseCase {
  constructor(private readonly processor: OrganizationTeamApplicationService) {}

  execute(params: OrganizationActorParams, page: OrganizationPageParams) {
    return this.processor.readTeam(params, (tx, policy) => {
      policy.assertMember();

      return tx.members.list({
        ...page,
        organizationId: tx.organization.id,
      });
    });
  }
}
