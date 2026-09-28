import type { ObjectStorage } from '../../../../shared/storage/objectStorage.port.js';
import type { OrganizationMemberRepository } from '../../domain/repositories/organizationMember.repository.js';
import type { OrganizationPageParams } from '../../domain/types/organization.types.js';

export class ListJoinedOrganizationsUseCase {
  constructor(
    private readonly memberRepository: OrganizationMemberRepository,
    private readonly storage: ObjectStorage,
  ) {}

  async execute(userId: string, page: OrganizationPageParams) {
    const result = await this.memberRepository.listJoined({
      userId,
      ...page,
    });

    return {
      ...result,
      items: result.items.map(({ logoKey, ...organization }) => ({
        ...organization,
        logoUrl: logoKey ? this.storage.publicUrl(logoKey) : null,
      })),
    };
  }
}
