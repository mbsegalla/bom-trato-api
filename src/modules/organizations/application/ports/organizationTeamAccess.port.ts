import type { OrganizationTeamLimits } from '../../domain/policies/organizationTeam.policy.js';

export interface ReadOrganizationTeamAccessParams {
  organizationId: string;
  now: Date;
}

export abstract class OrganizationTeamAccess {
  abstract read(params: ReadOrganizationTeamAccessParams): Promise<OrganizationTeamLimits>;
}
