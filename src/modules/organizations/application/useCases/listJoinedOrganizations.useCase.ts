import type { OrganizationMemberRepository } from '../../domain/repositories/organizationMember.repository.js';
import type { OrganizationPageParams } from '../../domain/types/organization.types.js';

export class ListJoinedOrganizationsUseCase {
  constructor(private readonly memberRepository: OrganizationMemberRepository) {}

  execute(userId: string, page: OrganizationPageParams) {
    return this.memberRepository.listJoined({
      userId,
      ...page,
    });
  }
}
