import type { ObjectStorage } from '../../../../shared/storage/objectStorage.port.js';
import { Organization } from '../../domain/entities/organization.entity.js';
import { toOrganizationProfileView } from '../mappers/organizationProfile.mapper.js';
import type { OrganizationActorParams } from '../ports/organizationUnitOfWork.port.js';
import type { OrganizationTeamApplicationService } from '../services/organizationTeamApplicationService.service.js';

export class RemoveOrganizationLogoUseCase {
  constructor(
    private readonly processor: OrganizationTeamApplicationService,
    private readonly storage: ObjectStorage,
  ) {}

  async execute(params: OrganizationActorParams) {
    const result = await this.processor.withTeam(params, async (tx, policy) => {
      policy.assertOwner();

      const organization = Organization.restore(tx.organization);

      const previousLogoKey = organization.snapshot().logoKey;

      organization.removeLogo();

      await tx.saveOrganization(organization.snapshot());

      return {
        profile: organization.profile(),
        previousLogoKey,
      };
    });

    if (result.previousLogoKey) {
      try {
        await this.storage.delete(result.previousLogoKey);
      } catch {
        // Best effort cleanup.
      }
    }

    return toOrganizationProfileView(result.profile, this.storage);
  }
}
