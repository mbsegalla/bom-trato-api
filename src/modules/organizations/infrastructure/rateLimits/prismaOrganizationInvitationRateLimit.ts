import type { Prisma } from '../../../../generated/prisma/client.js';
import type { ConsumeInvitationSendParams } from '../../application/ports/organizationInvitationRateLimit.port.js';
import { OrganizationInvitationRateLimit } from '../../application/ports/organizationInvitationRateLimit.port.js';
import { OrganizationTeamError } from '../../domain/errors/organizationTeam.error.js';

const invitationLimit = 30;
const invitationWindowMs = 60 * 60 * 1000;

export class PrismaOrganizationInvitationRateLimit extends OrganizationInvitationRateLimit {
  constructor(private readonly db: Prisma.TransactionClient) {
    super();
  }

  async consume({ organizationId, now }: ConsumeInvitationSendParams): Promise<void> {
    const row = await this.db.organizationInvitationRateLimit.findUnique({
      where: { organizationId },
    });

    const active = row !== null && row.expiresAt > now;

    if (active && row.count >= invitationLimit) {
      throw new OrganizationTeamError('INVITATION_RATE_LIMITED');
    }

    const data = {
      count: active ? row.count + 1 : 1,
      expiresAt: active ? row.expiresAt : new Date(now.getTime() + invitationWindowMs),
    };

    await this.db.organizationInvitationRateLimit.upsert({
      where: { organizationId },
      create: {
        organizationId,
        ...data,
      },
      update: data,
    });
  }
}
