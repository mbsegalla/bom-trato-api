import type { Prisma } from '../../../../generated/prisma/client.js';
import type { OrganizationPlatformAccessParams } from '../../application/ports/organizationPlatformAccessReader.port.js';
import type { OrganizationAccessContext } from '../../domain/policies/organizationAccess.policy.js';

import { readOrganizationPlatformAccess } from './prismaOrganizationPlatformAccess.js';

export async function readOrganizationAccess(
  db: Prisma.TransactionClient,
  params: OrganizationPlatformAccessParams,
): Promise<OrganizationAccessContext> {
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

  if (member === null) {
    return {
      isMember: false,
      verified: false,
      hasPlatformAccess: false,
      source: 'NONE',
      billingNeedsReconciliation: false,
    };
  }

  const { access } = await readOrganizationPlatformAccess(db, organizationId, new Date());

  return {
    isMember: true,
    verified: member.user.disabledAt === null && member.user.emailVerifiedAt !== null,
    hasPlatformAccess: access.hasAccess,
    source: access.source,
    billingNeedsReconciliation: access.billingNeedsReconciliation,
  };
}
