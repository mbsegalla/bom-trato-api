import type { Prisma } from '../../../../generated/prisma/client.js';
import { SubscriptionStatus } from '../../../../generated/prisma/enums.js';
import type { SubscriptionProps } from '../../../billing/domain/entities/subscription.entity.js';
import type { OrganizationTrialProps } from '../../domain/entities/organizationTrial.entity.js';
import type { OrganizationPlatformAccess } from '../../domain/policies/organizationPlatformAccess.policy.js';
import { OrganizationPlatformAccessPolicy } from '../../domain/policies/organizationPlatformAccess.policy.js';

export interface OrganizationPlatformAccessSnapshot {
  access: OrganizationPlatformAccess;
  currentSubscription: SubscriptionProps | null;
  trial: OrganizationTrialProps | null;
  hasPaidSubscriptionHistory: boolean;
}

export async function readOrganizationPlatformAccess(
  db: Prisma.TransactionClient,
  organizationId: string,
  now: Date,
): Promise<OrganizationPlatformAccessSnapshot> {
  const organization = await db.organization.findUnique({
    where: {
      id: organizationId,
    },
    select: {
      trial: true,
      subscriptions: {
        where: {
          status: {
            notIn: [SubscriptionStatus.CANCELED, SubscriptionStatus.INCOMPLETE_EXPIRED],
          },
        },
        orderBy: [{ stripeCreatedAt: 'desc' }, { id: 'desc' }],
        take: 2,
      },
    },
  });

  const subscriptions = organization?.subscriptions ?? [];
  const trial = organization?.trial ?? null;

  let hasPaidSubscriptionHistory = false;

  if (trial !== null) {
    const paidSubscription = await db.subscription.findFirst({
      where: {
        organizationId,
        paidThrough: {
          not: null,
        },
      },
      select: {
        id: true,
      },
    });

    const paidInvoice = await db.billingInvoice.findFirst({
      where: {
        organizationId,
        OR: [
          {
            paidAt: {
              not: null,
            },
          },
          {
            status: 'paid',
          },
        ],
      },
      select: {
        id: true,
      },
    });

    hasPaidSubscriptionHistory = paidSubscription !== null || paidInvoice !== null;
  }

  const access = OrganizationPlatformAccessPolicy.resolve(
    {
      organizationId,
      subscriptions,
      trial,
      hasPaidSubscriptionHistory,
    },
    now,
  );

  return {
    access,
    currentSubscription: subscriptions[0] ?? null,
    trial,
    hasPaidSubscriptionHistory,
  };
}
