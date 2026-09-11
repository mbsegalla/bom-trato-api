import type { Prisma } from '../../../../generated/prisma/client.js';
import { SubscriptionStatus } from '../../../../generated/prisma/enums.js';
import { Subscription } from '../../../billing/domain/entities/subscription.entity.js';
import type { ReadOrganizationTeamAccessParams } from '../../application/ports/organizationTeamAccess.port.js';
import { OrganizationTeamAccess } from '../../application/ports/organizationTeamAccess.port.js';
import { OrganizationTeamError } from '../../domain/errors/organizationTeam.error.js';

export class PrismaOrganizationTeamAccess extends OrganizationTeamAccess {
  constructor(private readonly db: Prisma.TransactionClient) {
    super();
  }

  async read({ organizationId, now }: ReadOrganizationTeamAccessParams) {
    const ongoing = await this.db.subscription.findMany({
      where: {
        organizationId,
        status: {
          notIn: [SubscriptionStatus.CANCELED, SubscriptionStatus.INCOMPLETE_EXPIRED],
        },
      },
      orderBy: [{ stripeCreatedAt: 'desc' }, { id: 'desc' }],
      take: 2,
      include: {
        planPrice: {
          include: {
            plan: true,
          },
        },
      },
    });

    if (ongoing.length > 1) {
      throw new OrganizationTeamError('BILLING_RECONCILIATION_REQUIRED');
    }

    const current = ongoing[0];

    if (current === undefined) {
      return {
        hasAccess: false,
        teamManagementEnabled: false,
        memberLimit: 0,
      };
    }

    const pending = await this.db.planChange.findUnique({
      where: {
        activeOrganizationId: organizationId,
      },
    });

    const plan = current.planPrice.plan;

    return {
      hasAccess: Subscription.restore(current).hasAccessAt(now),
      teamManagementEnabled: plan.teamManagementEnabled,
      memberLimit: Math.min(plan.maxUsers, pending?.targetMaxUsers ?? plan.maxUsers),
    };
  }
}
