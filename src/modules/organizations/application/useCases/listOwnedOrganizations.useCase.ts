import type { OrganizationRepository } from '../../domain/repositories/organization.repository.js';

export class ListOwnedOrganizationsUseCase {
  constructor(private readonly organizationRepository: OrganizationRepository) {}

  execute(userId: string) {
    return this.organizationRepository.listOwned(userId);
  }
}
