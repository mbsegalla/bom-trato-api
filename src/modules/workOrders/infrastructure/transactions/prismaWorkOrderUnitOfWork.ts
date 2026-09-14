import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { SubscriptionStatus } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { Subscription } from '../../../billing/domain/entities/subscription.entity.js';
import type {
  WorkOrderActorParams,
  WorkOrderReadContext,
  WorkOrderTransaction,
} from '../../application/ports/workOrderUnitOfWork.port.js';
import { WorkOrderUnitOfWork } from '../../application/ports/workOrderUnitOfWork.port.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import { PrismaWorkOrderRepository } from '../repositories/prismaWorkOrder.repository.js';

@Injectable()
export class PrismaWorkOrderUnitOfWork extends WorkOrderUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read<T>(params: WorkOrderActorParams, operation: (context: WorkOrderReadContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (db) => {
        await db.$executeRaw`SET TRANSACTION READ ONLY`;

        const organization = await db.organization.findUnique({
          where: { id: params.organizationId },
          select: { id: true },
        });

        if (organization === null) {
          throw new WorkOrderError('ORGANIZATION_NOT_FOUND');
        }

        return operation(await this.createContext(db, params));
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }

  async run<T>(params: WorkOrderActorParams, operation: (tx: WorkOrderTransaction) => Promise<T>): Promise<T> {
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
              throw new WorkOrderError('ORGANIZATION_NOT_FOUND');
            }

            return operation(await this.createContext(db, params));
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

    throw new WorkOrderError('WORK_ORDERS_BUSY');
  }

  private async createContext(
    db: Prisma.TransactionClient,
    params: WorkOrderActorParams,
  ): Promise<WorkOrderTransaction> {
    const member = await db.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: params.organizationId,
          userId: params.userId,
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
        organizationId: params.organizationId,
        status: {
          notIn: [SubscriptionStatus.CANCELED, SubscriptionStatus.INCOMPLETE_EXPIRED],
        },
      },
      orderBy: [{ stripeCreatedAt: 'desc' }, { id: 'desc' }],
      take: 2,
    });

    const current = subscriptions[0];

    return {
      workOrders: new PrismaWorkOrderRepository(db, params.organizationId),

      findQuote: async (quoteId) => {
        const row = await db.quote.findFirst({
          where: {
            id: quoteId,
            organizationId: params.organizationId,
          },
          include: {
            quoteItems: {
              orderBy: {
                position: 'asc',
              },
              select: {
                id: true,
                catalogServiceId: true,
                name: true,
                description: true,
                unit: true,
                quantityInThousandths: true,
                unitAmountInCents: true,
                totalInCents: true,
                position: true,
              },
            },
          },
        });

        if (row === null) {
          return null;
        }

        const { quoteItems, ...state } = row;

        return {
          ...state,
          items: quoteItems,
        };
      },

      isAssignableMember: async (userId) => {
        const candidate = await db.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: params.organizationId,
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

        return candidate !== null && candidate.user.disabledAt === null && candidate.user.emailVerifiedAt !== null;
      },

      access: {
        isMember: member !== null,
        verified: member !== null && member.user.disabledAt === null && member.user.emailVerifiedAt !== null,
        hasSubscriptionAccess: current !== undefined && Subscription.restore(current).hasAccessAt(new Date()),
        billingNeedsReconciliation: subscriptions.length > 1,
      },
    };
  }
}
