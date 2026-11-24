import type { OrganizationAccessContext } from '../../domain/policies/organizationAccess.policy.js';

export interface OrganizationPlatformAccessParams {
  organizationId: string;
  userId: string;
}

export abstract class OrganizationPlatformAccessReader {
  abstract read(params: OrganizationPlatformAccessParams): Promise<OrganizationAccessContext>;
}
