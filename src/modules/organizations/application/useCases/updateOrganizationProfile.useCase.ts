import type { OrganizationBusinessDetails } from '../../domain/entities/organization.entity.js';
import { Organization } from '../../domain/entities/organization.entity.js';
import type { OrganizationActorParams } from '../ports/organizationUnitOfWork.port.js';
import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';

export class UpdateOrganizationProfileUseCase {
  constructor(private readonly processor: OrganizationTeamApplicationService) {}

  execute(params: OrganizationActorParams, details: Partial<OrganizationBusinessDetails>) {
    return this.processor.withTeam(params, async (tx, policy) => {
      policy.assertOwner();

      const organization = Organization.restore(tx.organization);

      organization.update(details);

      await tx.saveOrganization(organization.snapshot());

      return organization.profile();
    });
  }
}
