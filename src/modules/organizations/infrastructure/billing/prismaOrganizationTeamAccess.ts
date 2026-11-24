import type { Prisma } from '../../../../generated/prisma/client.js';
import type { ReadOrganizationTeamAccessParams } from '../../application/ports/organizationTeamAccess.port.js';
import { OrganizationTeamAccess } from '../../application/ports/organizationTeamAccess.port.js';
import { OrganizationTeamError } from '../../domain/errors/organizationTeam.error.js';
import { readOrganizationPlatformAccess } from '../access/prismaOrganizationPlatformAccess.js';

export class PrismaOrganizationTeamAccess extends OrganizationTeamAccess {
  constructor(private readonly db: Prisma.TransactionClient) {
    super();
  }

  async read({ organizationId, now }: ReadOrganizationTeamAccessParams) {
    const { access, currentSubscription } = await readOrganizationPlatformAccess(this.db, organizationId, now);

    if (access.billingNeedsReconciliation) {
      throw new OrganizationTeamError('BILLING_RECONCILIATION_REQUIRED');
    }

    if (access.source === 'TRIAL') {
      return {
        hasAccess: true,
        teamManagementEnabled: false,
        memberLimit: 1,
      };
    }

    if (currentSubscription === null) {
      return {
        hasAccess: false,
        teamManagementEnabled: false,
        memberLimit: 0,
      };
    }

    const price = await this.db.planPrice.findUniqueOrThrow({
      where: {
        id: currentSubscription.planPriceId,
      },
      include: {
        plan: true,
      },
    });

    const pending = await this.db.planChange.findUnique({
      where: {
        activeOrganizationId: organizationId,
      },
    });

    const plan = price.plan;

    return {
      hasAccess: access.hasAccess,
      teamManagementEnabled: plan.teamManagementEnabled,
      memberLimit: Math.min(plan.maxUsers, pending?.targetMaxUsers ?? plan.maxUsers),
    };
  }
}
