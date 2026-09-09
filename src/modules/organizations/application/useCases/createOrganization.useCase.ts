import { randomUUID } from 'node:crypto';

import type { OrganizationProps } from '../../domain/entities/organization.entity.js';
import { Organization } from '../../domain/entities/organization.entity.js';
import type { OrganizationRepository } from '../../domain/repositories/organization.repository.js';

export interface CreateOrganizationParams {
  userId: string;
  email: string;
  name: string;
  creationKey: string;
}

export class CreateOrganizationUseCase {
  constructor(private readonly organizationRepository: OrganizationRepository) {}

  async execute(params: CreateOrganizationParams): Promise<OrganizationProps> {
    const { userId, email, name, creationKey } = params;

    const organization = Organization.create({
      id: randomUUID(),
      ownerId: userId,
      name,
    });

    return this.organizationRepository.create({
      organization: organization.snapshot(),
      billingEmail: email,
      creationKey,
    });
  }
}
