import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import type { WorkOrderAcceptanceReadContext } from '../../application/ports/workOrderAcceptanceUnitOfWork.port.js';
import { WorkOrderAcceptanceUnitOfWork } from '../../application/ports/workOrderAcceptanceUnitOfWork.port.js';
import type { WorkOrderByIdParams } from '../../application/types/workOrder.types.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import { PrismaWorkOrderAcceptanceRepository } from '../repositories/prismaWorkOrderAcceptance.repository.js';

@Injectable()
export class PrismaWorkOrderAcceptanceUnitOfWork extends WorkOrderAcceptanceUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read<T>(params: WorkOrderByIdParams, operation: (context: WorkOrderAcceptanceReadContext) => Promise<T>): Promise<T> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'read',
      async (db) =>
        operation({
          access: await readOrganizationAccess(db, params),
          acceptances: new PrismaWorkOrderAcceptanceRepository(db, params.organizationId, params.workOrderId),
          findWorkOrder: () =>
            db.workOrder.findFirst({
              where: { id: params.workOrderId, organizationId: params.organizationId },
              select: { id: true, organizationId: true, status: true, completedAt: true, version: true },
            }),
        }),
      {
        notFound: () => new WorkOrderError('ORGANIZATION_NOT_FOUND'),
        busy: () => new WorkOrderError('WORK_ORDERS_BUSY'),
      },
    );
  }
}
