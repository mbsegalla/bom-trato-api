import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { SubscriptionStatus } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { Subscription } from '../../../billing/domain/entities/subscription.entity.js';
import type { CustomerActorParams, CustomerTransaction } from '../../application/ports/customerUnitOfWork.port.js';
import { CustomerUnitOfWork } from '../../application/ports/customerUnitOfWork.port.js';
import { CustomerError } from '../../domain/errors/customer.error.js';
import { PrismaCustomerRepository } from '../repositories/prismaCustomer.repository.js';

@Injectable()
export class PrismaCustomerUnitOfWork extends CustomerUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async run<T>(params: CustomerActorParams, operation: (tx: CustomerTransaction) => Promise<T>): Promise<T> {
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
              throw new CustomerError('ORGANIZATION_NOT_FOUND');
            }

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

            return operation({
              customers: new PrismaCustomerRepository(db, params.organizationId),
              access: {
                isMember: member !== null,
                verified: member !== null && member.user.disabledAt === null && member.user.emailVerifiedAt !== null,
                hasSubscriptionAccess: current !== undefined && Subscription.restore(current).hasAccessAt(new Date()),
                billingNeedsReconciliation: subscriptions.length > 1,
              },
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

    throw new CustomerError('CUSTOMERS_BUSY');
  }
}
