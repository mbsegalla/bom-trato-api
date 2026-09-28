import type { ObjectStorage } from '../../../../shared/storage/objectStorage.port.js';
import type {
  PublicProfessionalPageParams,
  PublicProfileRepository,
} from '../../domain/repositories/publicProfile.repository.js';

export class ListPublicProfessionalsUseCase {
  constructor(
    private readonly repository: PublicProfileRepository,
    private readonly storage: ObjectStorage,
  ) {}

  async execute(params: PublicProfessionalPageParams) {
    const page = await this.repository.listPublished(params);

    return {
      ...page,
      items: page.items.map((item) => ({
        slug: item.slug,
        name: item.organization.name,
        logoUrl: item.organization.logoKey ? this.storage.publicUrl(item.organization.logoKey) : null,
        headline: item.headline,
        city: item.organization.city,
        state: item.organization.state,
        whatsappAvailable: item.whatsappAvailable,
        services: item.services.map((service) => ({
          id: service.id,
          name: service.name,
        })),
      })),
    };
  }
}
