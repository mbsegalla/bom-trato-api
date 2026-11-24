import type { Prisma } from '../../../../generated/prisma/client.js';
import type { OrganizationTrialProps } from '../../domain/entities/organizationTrial.entity.js';
import { OrganizationTrialRepository } from '../../domain/repositories/organizationTrial.repository.js';

const organizationTrialSelect = {
  id: true,
  organizationId: true,
  ownerId: true,
  startsAt: true,
  expiresAt: true,
  convertedAt: true,
  revokedAt: true,
} satisfies Prisma.OrganizationTrialSelect;

export class PrismaOrganizationTrialRepository extends OrganizationTrialRepository {
  constructor(private readonly db: Prisma.TransactionClient) {
    super();
  }

  findByOrganizationId(organizationId: string): Promise<OrganizationTrialProps | null> {
    return this.db.organizationTrial.findUnique({
      where: {
        organizationId,
      },
      select: organizationTrialSelect,
    });
  }

  findByOwnerId(ownerId: string): Promise<OrganizationTrialProps | null> {
    return this.db.organizationTrial.findUnique({
      where: {
        ownerId,
      },
      select: organizationTrialSelect,
    });
  }

  create(trial: OrganizationTrialProps): Promise<OrganizationTrialProps> {
    return this.db.organizationTrial.create({
      data: {
        id: trial.id,
        organizationId: trial.organizationId,
        ownerId: trial.ownerId,
        startsAt: trial.startsAt,
        expiresAt: trial.expiresAt,
        convertedAt: trial.convertedAt,
        revokedAt: trial.revokedAt,
      },
      select: organizationTrialSelect,
    });
  }
}
