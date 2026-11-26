import type { Prisma } from '../../../../generated/prisma/client.js';
import type { OrganizationActorParams } from '../../../organizations/application/ports/organizationUnitOfWork.port.js';
import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';

export async function assertReceivingSettingsOwner(db: Prisma.TransactionClient, params: OrganizationActorParams, write: boolean) {
  const access = await readOrganizationAccess(db, params);
  OrganizationAccessPolicy.assertVerifiedMember(access, (code) => new ReceivingSettingsError(code));

  const organization = await db.organization.findUnique({
    where: { id: params.organizationId },
    select: { ownerId: true },
  });
  const member = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: params.organizationId, userId: params.userId } },
    select: { role: true },
  });

  if (organization?.ownerId !== params.userId || member?.role !== 'OWNER') {
    throw new ReceivingSettingsError('OWNER_REQUIRED');
  }

  if (write) {
    OrganizationAccessPolicy.assertCanOperate(access, (code) => new ReceivingSettingsError(code));
  }

  return access;
}
