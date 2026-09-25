import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { OrganizationRole } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { OrganizationProps } from '../../domain/entities/organization.entity.js';
import { OrganizationError } from '../../domain/errors/organization.error.js';
import type { CreateOrganizationParams } from '../../domain/repositories/organization.repository.js';
import { OrganizationRepository } from '../../domain/repositories/organization.repository.js';

const organizationSelect = {
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
} as const;

@Injectable()
export class PrismaOrganizationRepository extends OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(params: CreateOrganizationParams): Promise<OrganizationProps> {
    const { organization, billingEmail, creationKey } = params;

    const where = {
      ownerId_creationKey: {
        ownerId: organization.ownerId,
        creationKey,
      },
    };

    const resolveExisting = async (): Promise<OrganizationProps | null> => {
      const existing = await this.prisma.organization.findUnique({
        where,
        select: organizationSelect,
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
          setupCompletedAt: new Date(),
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
        select: organizationSelect,
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
        setupCompletedAt: {
          not: null,
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: organizationSelect,
      take: 100,
    });
  }
}
