import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { SubscriptionStatus } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { Subscription } from '../../../billing/domain/entities/subscription.entity.js';
import type {
  QuoteActorParams,
  QuoteReadContext,
  QuoteTransaction,
} from '../../application/ports/quoteUnitOfWork.port.js';
import { QuoteUnitOfWork } from '../../application/ports/quoteUnitOfWork.port.js';
import { QuoteError } from '../../domain/errors/quote.error.js';
import { PrismaQuoteRepository } from '../repositories/prismaQuote.repository.js';

@Injectable()
export class PrismaQuoteUnitOfWork extends QuoteUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read<T>(params: QuoteActorParams, operation: (context: QuoteReadContext) => Promise<T>): Promise<T> {
    const { organizationId } = params;

    return this.prisma.$transaction(
      async (db) => {
        await db.$executeRaw`SET TRANSACTION READ ONLY`;

        const organization = await db.organization.findUnique({
          where: {
            id: organizationId,
          },
          select: {
            id: true,
          },
        });

        if (organization === null) {
          throw new QuoteError('ORGANIZATION_NOT_FOUND');
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

  async run<T>(params: QuoteActorParams, operation: (tx: QuoteTransaction) => Promise<T>): Promise<T> {
    const { organizationId } = params;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (db) => {
            const locked = await db.$queryRaw<Array<{ id: string }>>`
              SELECT "id"
              FROM "Organization"
              WHERE "id" = ${organizationId}::uuid
              FOR UPDATE
            `;

            if (locked.length === 0) {
              throw new QuoteError('ORGANIZATION_NOT_FOUND');
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

    throw new QuoteError('QUOTES_BUSY');
  }

  private async createContext(db: Prisma.TransactionClient, params: QuoteActorParams): Promise<QuoteTransaction> {
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
      quotes: new PrismaQuoteRepository(db, organizationId),
      findCustomer: (id: string) =>
        db.customer.findFirst({
          where: {
            id,
            organizationId,
          },
        }),
      findCatalogService: (id: string) =>
        db.catalogService.findFirst({
          where: {
            id,
            organizationId,
          },
        }),
      access: {
        isMember: member !== null,
        verified: member !== null && member.user.disabledAt === null && member.user.emailVerifiedAt !== null,
        hasSubscriptionAccess: current !== undefined && Subscription.restore(current).hasAccessAt(new Date()),
        billingNeedsReconciliation: subscriptions.length > 1,
      },
    };
  }
}
