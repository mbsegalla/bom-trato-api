import type { OrganizationTeamApplicationService } from '../../../organizations/application/services/organizationTeamApplicationService.service.js';
import { PublicBusinessProfile } from '../../domain/entities/publicBusinessProfile.entity.js';
import type { PublicProfileRepository } from '../../domain/repositories/publicProfile.repository.js';

export interface PublicProfileActorParams {
  organizationId: string;
  userId: string;
}

export class GetPublicProfileSettingsUseCase {
  constructor(
    private readonly organizations: OrganizationTeamApplicationService,
    private readonly repository: PublicProfileRepository,
  ) {}

  execute(params: PublicProfileActorParams) {
    return this.organizations.readTeam(params, async (context, policy) => {
      policy.assertMember();

      const profile = await this.repository.findByOrganizationId(params.organizationId);

      if (profile) {
        return {
          id: profile.id,
          slug: profile.slug,
          headline: profile.headline,
          description: profile.description,
          whatsappPhone: profile.whatsappPhone,
          whatsappEnabled: profile.whatsappEnabled,
          published: profile.published,
          publishedAt: profile.publishedAt,
          selectedServiceIds: profile.serviceIds,
          city: context.organization.city,
          state: context.organization.state,
        };
      }

      const suggestedSlug = await this.repository.suggestAvailableSlug(
        PublicBusinessProfile.slugFromName(context.organization.name),
        params.organizationId,
      );

      return {
        id: null,
        slug: suggestedSlug,
        headline: null,
        description: null,
        whatsappPhone: context.organization.phone,
        whatsappEnabled: false,
        published: false,
        publishedAt: null,
        selectedServiceIds: [],
        city: context.organization.city,
        state: context.organization.state,
      };
    });
  }
}
