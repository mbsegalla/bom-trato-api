import type { Prisma } from '../../../../generated/prisma/client.js';
import { SubscriptionStatus } from '../../../../generated/prisma/enums.js';
import { Subscription } from '../../../billing/domain/entities/subscription.entity.js';

interface OrganizationAccessParams {
  organizationId: string;
  userId: string;
}

export async function readOrganizationAccess(db: Prisma.TransactionClient, params: OrganizationAccessParams) {
  const { organizationId, userId } = params;

  const member = await db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
    select: {
      user: {
        select: {
          disabledAt: true,
          emailVerifiedAt: true,
        },
      },
    },
  });

  const subscriptions = await db.subscription.findMany({
    where: {
      organizationId,
      status: {
        notIn: [SubscriptionStatus.CANCELED, SubscriptionStatus.INCOMPLETE_EXPIRED],
      },
    },
    orderBy: [{ stripeCreatedAt: 'desc' }, { id: 'desc' }],
    take: 2,
  });

  const current = subscriptions[0];

  return {
    isMember: member !== null,
    verified: member !== null && member.user.disabledAt === null && member.user.emailVerifiedAt !== null,
    hasSubscriptionAccess: current !== undefined && Subscription.restore(current).hasAccessAt(new Date()),
    billingNeedsReconciliation: subscriptions.length > 1,
  };
}
