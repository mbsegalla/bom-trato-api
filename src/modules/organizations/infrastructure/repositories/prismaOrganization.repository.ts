import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { OrganizationRole } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { OrganizationProps } from '../../domain/entities/organization.entity.js';
import { OrganizationError } from '../../domain/errors/organization.error.js';
import type { CreateOrganizationParams } from '../../domain/repositories/organization.repository.js';
import { OrganizationRepository } from '../../domain/repositories/organization.repository.js';

@Injectable()
export class PrismaOrganizationRepository extends OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create({ organization, billingEmail, creationKey }: CreateOrganizationParams): Promise<OrganizationProps> {
    const where = {
      ownerId_creationKey: {
        ownerId: organization.ownerId,
        creationKey,
      },
    };

    const select = {
      id: true,
      name: true,
      ownerId: true,
    } as const;

    const resolveExisting = async (): Promise<OrganizationProps | null> => {
      const existing = await this.prisma.organization.findUnique({
        where,
        select,
      });

      if (existing !== null && existing.name !== organization.name) {
        throw new OrganizationError('IDEMPOTENCY_CONFLICT');
      }

      return existing;
    };

    const user = await this.prisma.user.findUnique({
      where: {
        id: organization.ownerId,
      },
      select: {
        emailVerifiedAt: true,
        disabledAt: true,
      },
    });

    if (user === null || user.emailVerifiedAt === null || user.disabledAt !== null) {
      throw new OrganizationError('VERIFIED_USER_REQUIRED');
    }

    const existing = await resolveExisting();

    if (existing !== null) {
      return existing;
    }

    try {
      return await this.prisma.organization.create({
        data: {
          ...organization,
          creationKey,
          organizationMembers: {
            create: {
              userId: organization.ownerId,
              role: OrganizationRole.OWNER,
            },
          },
          billingCustomer: {
            create: {
              billingEmail,
              billingName: organization.name,
            },
          },
        },
        select,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrent = await resolveExisting();

        if (concurrent !== null) {
          return concurrent;
        }
      }

      throw error;
    }
  }

  async listOwned(userId: string): Promise<OrganizationProps[]> {
    return this.prisma.organization.findMany({
      where: {
        ownerId: userId,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        ownerId: true,
      },
      take: 100,
    });
  }
}
