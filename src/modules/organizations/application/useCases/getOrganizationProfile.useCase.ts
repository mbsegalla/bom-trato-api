import { Organization } from '../../domain/entities/organization.entity.js';
import type { OrganizationActorParams } from '../ports/organizationUnitOfWork.port.js';
import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';

export class GetOrganizationProfileUseCase {
  constructor(private readonly processor: OrganizationTeamApplicationService) {}

  execute(params: OrganizationActorParams) {
    return this.processor.readTeam(params, async (context, policy) => {
      policy.assertMember();

      return Organization.restore(context.organization).profile();
    });
  }
}
