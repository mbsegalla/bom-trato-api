import type { OrganizationProps } from '../entities/organization.entity.js';

export interface CreateOrganizationParams {
  organization: OrganizationProps;
  billingEmail: string;
}

export interface CreateOrganizationParams {
  organization: OrganizationProps;
  billingEmail: string;
  creationKey: string;
}

export abstract class OrganizationRepository {
  abstract create(params: CreateOrganizationParams): Promise<OrganizationProps>;
  abstract listOwned(userId: string): Promise<OrganizationProps[]>;
}
