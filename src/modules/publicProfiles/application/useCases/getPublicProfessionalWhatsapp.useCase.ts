import { PublicProfileError } from '../../domain/errors/publicProfile.error.js';
import type { PublicProfileRepository } from '../../domain/repositories/publicProfile.repository.js';

export class GetPublicProfessionalWhatsappUseCase {
  constructor(private readonly repository: PublicProfileRepository) {}

  async execute(slug: string): Promise<string> {
    const contact = await this.repository.findWhatsappContact(slug.trim().toLowerCase());

    if (!contact) {
      throw new PublicProfileError('PUBLIC_PROFILE_CONTACT_UNAVAILABLE');
    }

    const message =
      `Olá! Encontrei ${contact.businessName} no Bom Trato ` + 'e gostaria de conversar sobre um serviço.';

    const query = new URLSearchParams({
      text: message,
    });

    return `https://wa.me/55${contact.phone}?${query.toString()}`;
  }
}
