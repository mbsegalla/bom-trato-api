import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { writeTransaction } from '../../../../infrastructure/database/prismaTransaction.js';
import { PrismaCustomerRepository } from '../../../customers/infrastructure/repositories/prismaCustomer.repository.js';
import { PrismaInAppNotificationRepository } from '../../../notifications/infrastructure/repositories/prismaInAppNotification.repository.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import {
  organizationTransaction,
  type OrganizationTransactionMode,
} from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { PrismaQuoteRepository } from '../../../quotes/infrastructure/repositories/prismaQuote.repository.js';
import type {
  LeadActorParams,
  LeadReadContext,
  LeadTransaction,
  PublicLeadContext,
} from '../../application/ports/leadUnitOfWork.port.js';
import { LeadUnitOfWork } from '../../application/ports/leadUnitOfWork.port.js';
import { LeadError } from '../../domain/errors/lead.error.js';
import { PrismaLeadRepository } from '../repositories/prismaLead.repository.js';

@Injectable()
export class PrismaLeadUnitOfWork extends LeadUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read<T>(params: LeadActorParams, operation: (context: LeadReadContext) => Promise<T>): Promise<T> {
    return this.execute('read', params, operation);
  }

  run<T>(params: LeadActorParams, operation: (tx: LeadTransaction) => Promise<T>): Promise<T> {
    return this.execute('write', params, operation);
  }

  publicRun<T>(slug: string, operation: (tx: PublicLeadContext) => Promise<T>): Promise<T> {
    return writeTransaction(
      this.prisma,
      async (db) => {
        const profile = await db.publicBusinessProfile.findFirst({
          where: {
            slug,
            published: true,
            organization: {
              setupCompletedAt: {
                not: null,
              },
            },
          },
          select: {
            id: true,
            organizationId: true,
            organization: {
              select: {
                name: true,
                ownerId: true,
                organizationMembers: {
                  where: {
                    user: {
                      disabledAt: null,
                      emailVerifiedAt: {
                        not: null,
                      },
                    },
                  },
                  select: {
                    userId: true,
                  },
                },
              },
            },
          },
        });

        if (profile === null) {
          throw new LeadError('PUBLIC_PROFILE_NOT_FOUND');
        }

        const recipientUserIds = [
          ...new Set([
            profile.organization.ownerId,
            ...profile.organization.organizationMembers.map((member) => member.userId),
          ]),
        ];

        return operation({
          organizationId: profile.organizationId,
          publicBusinessProfileId: profile.id,
          organizationName: profile.organization.name,
          recipientUserIds,
          leads: new PrismaLeadRepository(db, profile.organizationId),
          notifications: new PrismaInAppNotificationRepository(db),
          findPublicCatalogService: (id) =>
            db.catalogService.findFirst({
              where: {
                id,
                organizationId: profile.organizationId,
                archivedAt: null,
                publicProfileSelections: {
                  some: {
                    publicBusinessProfileId: profile.id,
                  },
                },
              },
            }),
        });
      },
      () => new LeadError('LEADS_BUSY'),
    );
  }

  private execute<T>(
    mode: OrganizationTransactionMode,
    params: LeadActorParams,
    operation: (tx: LeadTransaction) => Promise<T>,
  ): Promise<T> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      mode,
      async (db) => operation(await this.createContext(db, params)),
      {
        notFound: () => new LeadError('ORGANIZATION_NOT_FOUND'),
        busy: () => new LeadError('LEADS_BUSY'),
      },
    );
  }

  private async createContext(db: Prisma.TransactionClient, params: LeadActorParams): Promise<LeadTransaction> {
    const { organizationId } = params;

    const findCustomersByContact = (email: string | null, phone: string | null) => {
      const conditions: Prisma.CustomerWhereInput[] = [];

      if (email) {
        conditions.push({ email });
      }

      if (phone) {
        conditions.push({ phone });
      }

      if (conditions.length === 0) {
        return Promise.resolve([]);
      }

      return db.customer.findMany({
        where: {
          organizationId,
          OR: conditions,
        },
        take: 2,
      });
    };

    const findCatalogService = (id: string) =>
      db.catalogService.findFirst({
        where: {
          id,
          organizationId,
          archivedAt: null,
        },
      });

    return {
      leads: new PrismaLeadRepository(db, organizationId),
      customers: new PrismaCustomerRepository(db, organizationId),
      quotes: new PrismaQuoteRepository(db, organizationId),
      access: await readOrganizationAccess(db, params),
      findCustomersByContact,
      findCatalogService,
    };
  }
}
