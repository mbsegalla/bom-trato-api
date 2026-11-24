import type { OrganizationTrialProps } from '../entities/organizationTrial.entity.js';

export abstract class OrganizationTrialRepository {
  abstract findByOrganizationId(organizationId: string): Promise<OrganizationTrialProps | null>;
  abstract findByOwnerId(ownerId: string): Promise<OrganizationTrialProps | null>;
  abstract create(trial: OrganizationTrialProps): Promise<OrganizationTrialProps>;
}
