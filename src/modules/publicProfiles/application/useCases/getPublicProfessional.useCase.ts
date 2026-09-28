import type { ObjectStorage } from '../../../../shared/storage/objectStorage.port.js';
import { PublicProfileError } from '../../domain/errors/publicProfile.error.js';
import type { PublicProfileRepository } from '../../domain/repositories/publicProfile.repository.js';

export class GetPublicProfessionalUseCase {
  constructor(
    private readonly repository: PublicProfileRepository,
    private readonly storage: ObjectStorage,
  ) {}

  async execute(slug: string) {
    const profile = await this.repository.findPublishedBySlug(slug.trim().toLowerCase());

    if (!profile) {
      throw new PublicProfileError('PUBLIC_PROFILE_NOT_FOUND');
    }

    return {
      slug: profile.slug,
      name: profile.organization.name,
      logoUrl: profile.organization.logoKey ? this.storage.publicUrl(profile.organization.logoKey) : null,
      headline: profile.headline,
      description: profile.description,
      city: profile.organization.city,
      state: profile.organization.state,
      whatsappAvailable: profile.whatsappAvailable,
      services: profile.services,
    };
  }
}
