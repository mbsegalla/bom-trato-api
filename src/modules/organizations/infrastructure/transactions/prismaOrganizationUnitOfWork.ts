import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PrismaNotificationOutbox } from '../../../notifications/infrastructure/repositories/prismaNotificationOutbox.repository.js';
import type {
  OrganizationActorParams,
  OrganizationReadContext,
  OrganizationTransaction,
} from '../../application/ports/organizationUnitOfWork.port.js';
import { OrganizationUnitOfWork } from '../../application/ports/organizationUnitOfWork.port.js';
import { OrganizationTeamError } from '../../domain/errors/organizationTeam.error.js';
import { PrismaOrganizationTeamAccess } from '../billing/prismaOrganizationTeamAccess.js';
import { PrismaOrganizationInvitationRateLimit } from '../rateLimits/prismaOrganizationInvitationRateLimit.js';
import { PrismaOrganizationInvitationRepository } from '../repositories/prismaOrganizationInvitation.repository.js';
import { PrismaOrganizationMemberRepository } from '../repositories/prismaOrganizationMember.repository.js';

import { organizationTransaction } from './organizationTransaction.js';

@Injectable()
export class PrismaOrganizationUnitOfWork extends OrganizationUnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: PrismaNotificationOutbox,
  ) {
    super();
  }

  read<T>(params: OrganizationActorParams, operation: (context: OrganizationReadContext) => Promise<T>): Promise<T> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'read',
      async (db) => {
        const identity = await this.readIdentity(db, params);
        const members = new PrismaOrganizationMemberRepository(db);
        const invitations = new PrismaOrganizationInvitationRepository(db);

        return operation({
          ...identity,
          members: {
            list: (input) => members.list(input),
          },
          invitations: {
            list: (input) => invitations.list(input),
          },
        });
      },
      this.errors(),
    );
  }

  async run<T>(params: OrganizationActorParams, operation: (tx: OrganizationTransaction) => Promise<T>): Promise<T> {
    let notificationInserted = false;

    const result = await organizationTransaction(
      this.prisma,
      params.organizationId,
      'write',
      async (db) =>
        operation({
          ...(await this.readIdentity(db, params)),
          members: new PrismaOrganizationMemberRepository(db),
          invitations: new PrismaOrganizationInvitationRepository(db),
          access: new PrismaOrganizationTeamAccess(db),
          invitationRateLimit: new PrismaOrganizationInvitationRateLimit(db),
          notifications: this.outbox.using(db, () => {
            notificationInserted = true;
          }),
          saveOrganization: (organization) => this.saveOrganization(db, params.organizationId, organization),
        }),
      this.errors(),
    );

    if (notificationInserted) {
      this.outbox.notifyWorker();
    }

    return result;
  }

  private async readIdentity(
    db: Prisma.TransactionClient,
    params: OrganizationActorParams,
  ): Promise<Pick<OrganizationTransaction, 'organization' | 'actor' | 'actorRole'>> {
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
        email: true,
        phone: true,
        documentType: true,
        document: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        ownerId: true,
      },
    });

    const member = await db.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: params.organizationId,
          userId: params.userId,
        },
      },
      select: {
        role: true,
      },
    });

    return {
      organization,
      actor: {
        id: actor.id,
        email: actor.email,
        disabled: actor.disabledAt !== null,
        emailVerified: actor.emailVerifiedAt !== null,
      },
      actorRole: member?.role ?? null,
    };
  }

  private async saveOrganization(
    db: Prisma.TransactionClient,
    organizationId: string,
    organization: OrganizationTransaction['organization'],
  ): Promise<void> {
    if (organization.id !== organizationId) {
      throw new OrganizationTeamError('ORGANIZATION_NOT_FOUND');
    }

    const result = await db.organization.updateMany({
      where: {
        id: organizationId,
      },
      data: {
        name: organization.name,
        email: organization.email,
        phone: organization.phone,
        documentType: organization.documentType,
        document: organization.document,
        addressLine1: organization.addressLine1,
        addressLine2: organization.addressLine2,
        city: organization.city,
        state: organization.state,
        postalCode: organization.postalCode,
      },
    });

    if (result.count !== 1) {
      throw new OrganizationTeamError('ORGANIZATION_NOT_FOUND');
    }
  }

  private errors() {
    return {
      notFound: () => new OrganizationTeamError('ORGANIZATION_NOT_FOUND'),
      busy: () => new OrganizationTeamError('TEAM_BUSY'),
    };
  }
}
