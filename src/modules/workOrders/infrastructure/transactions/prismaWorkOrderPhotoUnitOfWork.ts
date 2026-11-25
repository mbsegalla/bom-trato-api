import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import type { OrganizationTransactionMode } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import type {
  WorkOrderPhotoReadContext,
  WorkOrderPhotoTransaction,
} from '../../application/ports/workOrderPhotoUnitOfWork.port.js';
import { WorkOrderPhotoUnitOfWork } from '../../application/ports/workOrderPhotoUnitOfWork.port.js';
import type { WorkOrderByIdParams } from '../../application/types/workOrder.types.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import { PrismaWorkOrderPhotoRepository } from '../repositories/prismaWorkOrderPhoto.repository.js';

@Injectable()
export class PrismaWorkOrderPhotoUnitOfWork extends WorkOrderPhotoUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read<T>(params: WorkOrderByIdParams, operation: (context: WorkOrderPhotoReadContext) => Promise<T>): Promise<T> {
    return this.execute('read', params, operation);
  }

  run<T>(params: WorkOrderByIdParams, operation: (tx: WorkOrderPhotoTransaction) => Promise<T>): Promise<T> {
    return this.execute('write', params, operation);
  }

  private execute<T>(
    mode: OrganizationTransactionMode,
    params: WorkOrderByIdParams,
    operation: (tx: WorkOrderPhotoTransaction) => Promise<T>,
  ): Promise<T> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      mode,
      async (db) =>
        operation({
          access: await readOrganizationAccess(db, params),
          photos: new PrismaWorkOrderPhotoRepository(db, params.organizationId, params.workOrderId),
          workOrderExists: async () =>
            (await db.workOrder.findFirst({
              where: { id: params.workOrderId, organizationId: params.organizationId },
              select: { id: true },
            })) !== null,
        }),
      {
        notFound: () => new WorkOrderError('ORGANIZATION_NOT_FOUND'),
        busy: () => new WorkOrderError('WORK_ORDERS_BUSY'),
      },
    );
  }
}
