import { randomBytes } from 'node:crypto';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { OrganizationInvitationStatus } from '../../../../generated/prisma/enums.js';
import type { OrganizationInvitation } from '../../domain/entities/organizationInvitation.entity.js';
import type {
  InvalidateAcceptedInvitationsParams,
  InvitationByIdParams,
  ListInvitationsParams,
  PendingInvitationParams,
} from '../../domain/repositories/organizationInvitation.repository.js';
import { OrganizationInvitationRepository } from '../../domain/repositories/organizationInvitation.repository.js';
import { toOrganizationPage } from '../mappers/organizationPage.mapper.js';

function invitationData(invitation: OrganizationInvitation) {
  const state = invitation.snapshot();

  return {
    ...state,
    pendingEmail: state.status === OrganizationInvitationStatus.PENDING ? state.email : null,
  };
}

export class PrismaOrganizationInvitationRepository extends OrganizationInvitationRepository {
  constructor(private readonly db: Prisma.TransactionClient) {
    super();
  }

  findById({ organizationId, invitationId }: InvitationByIdParams) {
    return this.db.organizationInvitation.findFirst({
      where: {
        id: invitationId,
        organizationId,
      },
    });
  }

  findPending({ organizationId, email }: PendingInvitationParams) {
    return this.db.organizationInvitation.findUnique({
      where: {
        organizationId_pendingEmail: {
          organizationId,
          pendingEmail: email,
        },
      },
    });
  }

  findByTokenHash(tokenHash: string) {
    return this.db.organizationInvitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        organizationId: true,
      },
    });
  }

  async create(invitation: OrganizationInvitation): Promise<void> {
    await this.db.organizationInvitation.create({
      data: invitationData(invitation),
    });
  }

  async save(invitation: OrganizationInvitation): Promise<void> {
    const data = invitationData(invitation);

    await this.db.organizationInvitation.update({
      where: {
        id: data.id,
        organizationId: data.organizationId,
      },
      data,
    });
  }

  async invalidateAcceptedTokens({ organizationId, userId }: InvalidateAcceptedInvitationsParams): Promise<void> {
    const rows = await this.db.organizationInvitation.findMany({
      where: {
        organizationId,
        acceptedById: userId,
        status: OrganizationInvitationStatus.ACCEPTED,
      },
      select: {
        id: true,
      },
    });

    for (const row of rows) {
      await this.db.organizationInvitation.update({
        where: {
          id: row.id,
          organizationId,
        },
        data: {
          tokenHash: randomBytes(32).toString('hex'),
        },
      });
    }
  }

  async list(params: ListInvitationsParams) {
    const { status, organizationId, page, limit, now } = params;

    let filter: Prisma.OrganizationInvitationWhereInput = {};

    if (status === OrganizationInvitationStatus.PENDING) {
      filter = {
        status: OrganizationInvitationStatus.PENDING,
        expiresAt: { gt: now },
      };
    } else if (status === OrganizationInvitationStatus.EXPIRED) {
      filter = {
        OR: [
          {
            status: OrganizationInvitationStatus.EXPIRED,
          },
          {
            status: OrganizationInvitationStatus.PENDING,
            expiresAt: { lte: now },
          },
        ],
      };
    } else if (status !== undefined) {
      filter = {
        status,
      };
    }

    const rows = await this.db.organizationInvitation.findMany({
      where: {
        ...filter,
        organizationId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit + 1,
    });

    return toOrganizationPage(rows, params);
  }
}
