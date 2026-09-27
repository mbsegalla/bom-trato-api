import type { ObjectStorage } from '../../../../shared/storage/objectStorage.port.js';
import { Organization } from '../../domain/entities/organization.entity.js';
import { toOrganizationProfileView } from '../mappers/organizationProfile.mapper.js';
import type { OrganizationActorParams } from '../ports/organizationUnitOfWork.port.js';
import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';

export class GetOrganizationProfileUseCase {
  constructor(
    private readonly processor: OrganizationTeamApplicationService,
    private readonly storage: ObjectStorage,
  ) {}

  execute(params: OrganizationActorParams) {
    return this.processor.readTeam(params, async (context, policy) => {
      policy.assertMember();

      const profile = Organization.restore(context.organization).profile();

      return toOrganizationProfileView(profile, this.storage);
    });
  }
}
