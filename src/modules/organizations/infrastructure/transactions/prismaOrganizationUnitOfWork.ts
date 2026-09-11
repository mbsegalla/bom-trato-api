import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  OrganizationActorParams,
  OrganizationTransaction,
} from '../../application/ports/organizationUnitOfWork.port.js';
import { OrganizationUnitOfWork } from '../../application/ports/organizationUnitOfWork.port.js';
import { OrganizationTeamError } from '../../domain/errors/organizationTeam.error.js';
import { PrismaOrganizationTeamAccess } from '../billing/prismaOrganizationTeamAccess.js';
import { PrismaOrganizationInvitationRateLimit } from '../rateLimits/prismaOrganizationInvitationRateLimit.js';
import { PrismaOrganizationInvitationRepository } from '../repositories/prismaOrganizationInvitation.repository.js';
import { PrismaOrganizationMemberRepository } from '../repositories/prismaOrganizationMember.repository.js';

@Injectable()
export class PrismaOrganizationUnitOfWork extends OrganizationUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async run<T>(params: OrganizationActorParams, operation: (tx: OrganizationTransaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (db) => {
            const locked = await db.$queryRaw<Array<{ id: string }>>`
              SELECT "id"
              FROM "Organization"
              WHERE "id" = ${params.organizationId}::uuid
              FOR UPDATE
            `;

            if (locked.length === 0) {
              throw new OrganizationTeamError('ORGANIZATION_NOT_FOUND');
            }

            const actor = await db.user.findUnique({
              where: {
                id: params.userId,
              },
              select: {
                id: true,
                email: true,
                disabledAt: true,
                emailVerifiedAt: true,
              },
            });

            if (actor === null) {
              throw new OrganizationTeamError('VERIFIED_USER_REQUIRED');
            }

            const organization = await db.organization.findUniqueOrThrow({
              where: {
                id: params.organizationId,
              },
              select: {
                id: true,
                name: true,
                ownerId: true,
              },
            });

            const members = new PrismaOrganizationMemberRepository(db);

            const member = await members.findByUser(params);

            return operation({
              organization,
              actor: {
                id: actor.id,
                email: actor.email,
                disabled: actor.disabledAt !== null,
                emailVerified: actor.emailVerifiedAt !== null,
              },
              actorRole: member?.role ?? null,
              members,
              invitations: new PrismaOrganizationInvitationRepository(db),
              access: new PrismaOrganizationTeamAccess(db),
              invitationRateLimit: new PrismaOrganizationInvitationRateLimit(db),
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          continue;
        }

        throw error;
      }
    }

    throw new OrganizationTeamError('TEAM_BUSY');
  }
}
