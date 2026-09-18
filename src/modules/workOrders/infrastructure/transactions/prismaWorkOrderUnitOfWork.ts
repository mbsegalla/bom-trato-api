import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import type { OrganizationTransactionMode } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { PrismaQuoteRepository } from '../../../quotes/infrastructure/repositories/prismaQuote.repository.js';
import type {
  WorkOrderActorParams,
  WorkOrderReadContext,
  WorkOrderTransaction,
} from '../../application/ports/workOrderUnitOfWork.port.js';
import { WorkOrderUnitOfWork } from '../../application/ports/workOrderUnitOfWork.port.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import { PrismaWorkOrderRepository } from '../repositories/prismaWorkOrder.repository.js';
import { PrismaWorkOrderScheduleRepository } from '../repositories/prismaWorkOrderSchedule.repository.js';

@Injectable()
export class PrismaWorkOrderUnitOfWork extends WorkOrderUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read<T>(params: WorkOrderActorParams, operation: (context: WorkOrderReadContext) => Promise<T>): Promise<T> {
    return this.execute('read', params, operation);
  }

  run<T>(params: WorkOrderActorParams, operation: (tx: WorkOrderTransaction) => Promise<T>): Promise<T> {
    return this.execute('write', params, operation);
  }

  private execute<T>(
    mode: OrganizationTransactionMode,
    params: WorkOrderActorParams,
    operation: (tx: WorkOrderTransaction) => Promise<T>,
  ): Promise<T> {
    const { organizationId } = params;

    return organizationTransaction(
      this.prisma,
      organizationId,
      mode,
      async (db) => operation(await this.createContext(db, params)),
      {
        notFound: () => new WorkOrderError('ORGANIZATION_NOT_FOUND'),
        busy: () => new WorkOrderError('WORK_ORDERS_BUSY'),
      },
    );
  }

  private async createContext(
    db: Prisma.TransactionClient,
    params: WorkOrderActorParams,
  ): Promise<WorkOrderTransaction> {
    const { organizationId } = params;
    const quotes = new PrismaQuoteRepository(db, organizationId);

    return {
      workOrders: new PrismaWorkOrderRepository(db, organizationId),
      access: await readOrganizationAccess(db, params),
      schedule: new PrismaWorkOrderScheduleRepository(db, organizationId),
      findQuote: (id) => quotes.findById(id),
      isAssignableMember: async (userId) => {
        const member = await db.organizationMember.findFirst({
          where: {
            organizationId,
            userId,
            user: {
              disabledAt: null,
              emailVerifiedAt: { not: null },
            },
          },
          select: { id: true },
        });

        return member !== null;
      },
    };
  }
}
