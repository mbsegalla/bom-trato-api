import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PrismaInAppNotificationRepository } from '../../../notifications/infrastructure/repositories/prismaInAppNotification.repository.js';
import { PrismaNotificationOutbox } from '../../../notifications/infrastructure/repositories/prismaNotificationOutbox.repository.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
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
import { PrismaWorkOrderReviewInvitationRepository } from '../repositories/prismaWorkOrderReviewInvitation.repository.js';
import { PrismaWorkOrderScheduleRepository } from '../repositories/prismaWorkOrderSchedule.repository.js';

@Injectable()
export class PrismaWorkOrderUnitOfWork extends WorkOrderUnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: PrismaNotificationOutbox,
  ) {
    super();
  }

  read<T>(params: WorkOrderActorParams, operation: (context: WorkOrderReadContext) => Promise<T>): Promise<T> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'read',
      async (db) => {
        const context = await this.createReadContext(db, params);

        return operation(context);
      },
      this.errors(),
    );
  }

  async run<T>(params: WorkOrderActorParams, operation: (tx: WorkOrderTransaction) => Promise<T>): Promise<T> {
    let notificationInserted = false;

    const result = await organizationTransaction(
      this.prisma,
      params.organizationId,
      'write',
      async (db) => {
        const tx = await this.createTransactionContext(db, params, () => {
          notificationInserted = true;
        });

        return operation(tx);
      },
      this.errors(),
    );

    if (notificationInserted) {
      this.outbox.notifyWorker();
    }

    return result;
  }

  private async createReadContext(
    db: Prisma.TransactionClient,
    params: WorkOrderActorParams,
  ): Promise<WorkOrderReadContext> {
    const { organizationId } = params;

    return {
      workOrders: new PrismaWorkOrderRepository(db, organizationId),
      access: await readOrganizationAccess(db, params),
      schedule: new PrismaWorkOrderScheduleRepository(db, organizationId),
    };
  }

  private async createTransactionContext(
    db: Prisma.TransactionClient,
    params: WorkOrderActorParams,
    onNotificationInserted: () => void,
  ): Promise<WorkOrderTransaction> {
    const { organizationId } = params;

    const quotes = new PrismaQuoteRepository(db, organizationId);

    return {
      workOrders: new PrismaWorkOrderRepository(db, organizationId),
      access: await readOrganizationAccess(db, params),
      schedule: new PrismaWorkOrderScheduleRepository(db, organizationId),
      inAppNotifications: new PrismaInAppNotificationRepository(db),
      notifications: this.outbox.using(db, onNotificationInserted),
      reviewInvitations: new PrismaWorkOrderReviewInvitationRepository(db, organizationId),
      findQuote: (id) => quotes.findById(id),
      isAssignableMember: async (userId) => {
        const member = await db.organizationMember.findFirst({
          where: {
            organizationId,
            userId,
            user: {
              disabledAt: null,
              emailVerifiedAt: {
                not: null,
              },
            },
          },
          select: {
            id: true,
          },
        });

        return member !== null;
      },
    };
  }

  private errors() {
    return {
      notFound: () => new WorkOrderError('ORGANIZATION_NOT_FOUND'),
      busy: () => new WorkOrderError('WORK_ORDERS_BUSY'),
    };
  }
}
