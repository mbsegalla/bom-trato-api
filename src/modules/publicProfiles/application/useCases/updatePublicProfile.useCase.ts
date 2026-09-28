import { randomUUID } from 'crypto';

import type { OrganizationTeamApplicationService } from '../../../organizations/application/services/organizationTeamApplicationService.service.js';
import type { PublicBusinessProfileDetails } from '../../domain/entities/publicBusinessProfile.entity.js';
import { PublicBusinessProfile } from '../../domain/entities/publicBusinessProfile.entity.js';
import { PublicProfileError } from '../../domain/errors/publicProfile.error.js';
import type { PublicProfileRepository } from '../../domain/repositories/publicProfile.repository.js';

import type { PublicProfileActorParams } from './getPublicProfileSettings.useCase.js';

export class UpdatePublicProfileUseCase {
  constructor(
    private readonly organizations: OrganizationTeamApplicationService,
    private readonly repository: PublicProfileRepository,
  ) {}

  execute(params: PublicProfileActorParams, details: PublicBusinessProfileDetails) {
    const { organizationId } = params;

    return this.organizations.readTeam(params, async (context, policy) => {
      policy.assertOwner();

      if (details.published && (!context.organization.city || !context.organization.state)) {
        throw new PublicProfileError('PUBLIC_PROFILE_LOCATION_REQUIRED');
      }

      const existing = await this.repository.findByOrganizationId(organizationId);

      const now = new Date();

      const profile = existing
        ? PublicBusinessProfile.restore(existing)
        : PublicBusinessProfile.create(
            {
              id: randomUUID(),
              organizationId,
              ...details,
            },
            now,
          );

      if (existing) {
        profile.update(details, now);
      }

      const saved = await this.repository.save(profile);

      return {
        id: saved.id,
        slug: saved.slug,
        headline: saved.headline,
        description: saved.description,
        whatsappPhone: saved.whatsappPhone,
        whatsappEnabled: saved.whatsappEnabled,
        published: saved.published,
        publishedAt: saved.publishedAt,
        selectedServiceIds: saved.serviceIds,
        city: context.organization.city,
        state: context.organization.state,
      };
    });
  }
}
