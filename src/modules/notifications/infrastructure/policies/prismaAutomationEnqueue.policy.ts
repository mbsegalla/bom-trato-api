import type { Prisma } from '../../../../generated/prisma/client.js';
import { readOrganizationPlatformAccess } from '../../../organizations/infrastructure/access/prismaOrganizationPlatformAccess.js';
import { TrialAutomationPolicy } from '../../domain/policies/trialAutomation.policy.js';

export async function canEnqueueAutomation(db: Prisma.TransactionClient, organizationId: string): Promise<boolean> {
  const organizations = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Organization"
    WHERE "id" = ${organizationId}::uuid
    FOR UPDATE
  `;

  if (organizations.length === 0) {
    return false;
  }

  const now = new Date();

  const { access, trial } = await readOrganizationPlatformAccess(db, organizationId, now);

  if (access.source !== 'TRIAL') {
    return TrialAutomationPolicy.canEnqueue(access, 0);
  }

  if (trial === null || !access.hasAccess || access.billingNeedsReconciliation) {
    return false;
  }

  const used = await db.notificationOutbox.count({
    where: {
      organizationId,
      automationType: {
        not: null,
      },
      createdAt: {
        gte: trial.startsAt,
        lt: trial.expiresAt,
      },
    },
  });

  return TrialAutomationPolicy.canEnqueue(access, used);
}
