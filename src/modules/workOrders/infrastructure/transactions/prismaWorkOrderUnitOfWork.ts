import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  organizationTransaction,
  OrganizationTransactionMode,
} from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import type {
  WorkOrderActorParams,
  WorkOrderReadContext,
  WorkOrderTransaction,
} from '../../application/ports/workOrderUnitOfWork.port.js';
import { WorkOrderUnitOfWork } from '../../application/ports/workOrderUnitOfWork.port.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';

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
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      mode,
      async (db) => operation(db as unknown as WorkOrderTransaction),
      {
        notFound: () => new WorkOrderError('ORGANIZATION_NOT_FOUND'),
        busy: () => new WorkOrderError('WORK_ORDERS_BUSY'),
      },
    );
  }
}
