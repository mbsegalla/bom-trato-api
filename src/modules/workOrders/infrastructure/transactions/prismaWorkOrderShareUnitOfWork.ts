import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import type { OrganizationTransactionMode } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import type {
  WorkOrderShareReadContext,
  WorkOrderShareSource,
  WorkOrderShareTransaction,
} from '../../application/ports/workOrderShareUnitOfWork.port.js';
import { WorkOrderShareUnitOfWork } from '../../application/ports/workOrderShareUnitOfWork.port.js';
import type { WorkOrderActorParams } from '../../application/ports/workOrderUnitOfWork.port.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import { PrismaWorkOrderShareRepository } from '../repositories/prismaWorkOrderShare.repository.js';

@Injectable()
export class PrismaWorkOrderShareUnitOfWork extends WorkOrderShareUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read<T>(params: WorkOrderActorParams, operation: (context: WorkOrderShareReadContext) => Promise<T>): Promise<T> {
    return this.execute('read', params, operation);
  }

  run<T>(params: WorkOrderActorParams, operation: (tx: WorkOrderShareTransaction) => Promise<T>): Promise<T> {
    return this.execute('write', params, operation);
  }

  private execute<T>(
    mode: OrganizationTransactionMode,
    params: WorkOrderActorParams,
    operation: (tx: WorkOrderShareTransaction) => Promise<T>,
  ): Promise<T> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
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
  ): Promise<WorkOrderShareTransaction> {
    const { organizationId } = params;

    return {
      access: await readOrganizationAccess(db, params),
      shares: new PrismaWorkOrderShareRepository(db, organizationId),
      findWorkOrder: (workOrderId) => this.findWorkOrder(db, organizationId, workOrderId),
    };
  }

  private findWorkOrder(
    db: Prisma.TransactionClient,
    organizationId: string,
    workOrderId: string,
  ): Promise<WorkOrderShareSource | null> {
    return db.workOrder.findFirst({
      where: {
        id: workOrderId,
        organizationId,
      },
      select: {
        id: true,
        organizationId: true,
        version: true,
      },
    });
  }
}
