import type { Prisma } from '../../../../generated/prisma/client.js';
import type { ConsumeInvitationSendParams } from '../../application/ports/organizationInvitationRateLimit.port.js';
import { OrganizationInvitationRateLimit } from '../../application/ports/organizationInvitationRateLimit.port.js';
import { OrganizationTeamError } from '../../domain/errors/organizationTeam.error.js';

export class PrismaOrganizationInvitationRateLimit extends OrganizationInvitationRateLimit {
  constructor(private readonly db: Prisma.TransactionClient) {
    super();
  }

  async consume({ organizationId, now }: ConsumeInvitationSendParams): Promise<void> {
    const row = await this.db.organizationInvitationRateLimit.findUnique({
      where: { organizationId },
    });

    const active = row !== null && row.expiresAt > now;

    if (active && row.count >= 30) {
      throw new OrganizationTeamError('INVITATION_RATE_LIMITED');
    }

    const data = {
      count: active ? row.count + 1 : 1,
      expiresAt: active ? row.expiresAt : new Date(now.getTime() + 3_600_000),
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
