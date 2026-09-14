import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { SubscriptionStatus } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { Subscription } from '../../../billing/domain/entities/subscription.entity.js';
import type {
  CatalogServiceActorParams,
  CatalogServiceReadContext,
  CatalogServiceTransaction,
} from '../../application/ports/catalogServiceUnitOfWork.port.js';
import { CatalogServiceUnitOfWork } from '../../application/ports/catalogServiceUnitOfWork.port.js';
import { CatalogServiceError } from '../../domain/errors/catalogService.error.js';
import { PrismaCatalogServiceRepository } from '../repositories/prismaCatalogService.repository.js';

@Injectable()
export class PrismaCatalogServiceUnitOfWork extends CatalogServiceUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read<T>(
    params: CatalogServiceActorParams,
    operation: (context: CatalogServiceReadContext) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (db) => {
        await db.$executeRaw`SET TRANSACTION READ ONLY`;

        const organization = await db.organization.findUnique({
          where: {
            id: params.organizationId,
          },
          select: {
            id: true,
          },
        });

        if (organization === null) {
          throw new CatalogServiceError('ORGANIZATION_NOT_FOUND');
        }

        const context = await this.createContext(db, params);

        return operation(context);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }

  async run<T>(
    params: CatalogServiceActorParams,
    operation: (tx: CatalogServiceTransaction) => Promise<T>,
  ): Promise<T> {
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
              throw new CatalogServiceError('ORGANIZATION_NOT_FOUND');
            }

            const context = await this.createContext(db, params);

            return operation(context);
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

    throw new CatalogServiceError('CATALOG_BUSY');
  }

  private async createContext(
    db: Prisma.TransactionClient,
    params: CatalogServiceActorParams,
  ): Promise<CatalogServiceTransaction> {
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

    const subscriptions = await db.subscription.findMany({
      where: {
        organizationId,
        status: {
          notIn: [SubscriptionStatus.CANCELED, SubscriptionStatus.INCOMPLETE_EXPIRED],
        },
      },
      orderBy: [{ stripeCreatedAt: 'desc' }, { id: 'desc' }],
      take: 2,
    });

    const current = subscriptions[0];

    return {
      catalogServices: new PrismaCatalogServiceRepository(db, organizationId),
      access: {
        isMember: member !== null,
        verified: member !== null && member.user.disabledAt === null && member.user.emailVerifiedAt !== null,
        hasSubscriptionAccess: current !== undefined && Subscription.restore(current).hasAccessAt(new Date()),
        billingNeedsReconciliation: subscriptions.length > 1,
      },
    };
  }
}
