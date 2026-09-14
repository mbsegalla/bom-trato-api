import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import type { OrganizationTransactionMode } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import type {
  ReceivableActorParams,
  ReceivableReadContext,
  ReceivableTransaction,
} from '../../application/ports/receivableUnitOfWork.port.js';
import { ReceivableUnitOfWork } from '../../application/ports/receivableUnitOfWork.port.js';
import { ReceivableError } from '../../domain/errors/receivable.error.js';
import { PrismaReceivableRepository } from '../repositories/prismaReceivable.repository.js';

@Injectable()
export class PrismaReceivableUnitOfWork extends ReceivableUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read<T>(params: ReceivableActorParams, operation: (context: ReceivableReadContext) => Promise<T>): Promise<T> {
    return this.execute('read', params, operation);
  }

  run<T>(params: ReceivableActorParams, operation: (tx: ReceivableTransaction) => Promise<T>): Promise<T> {
    return this.execute('write', params, operation);
  }

  private execute<T>(
    mode: OrganizationTransactionMode,
    params: ReceivableActorParams,
    operation: (tx: ReceivableTransaction) => Promise<T>,
  ): Promise<T> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      mode,
      async (db) => operation(await this.createContext(db, params)),
      {
        notFound: () => new ReceivableError('ORGANIZATION_NOT_FOUND'),
        busy: () => new ReceivableError('RECEIVABLES_BUSY'),
      },
    );
  }

  private async createContext(
    db: Prisma.TransactionClient,
    params: ReceivableActorParams,
  ): Promise<ReceivableTransaction> {
    return {
      receivables: new PrismaReceivableRepository(db, params.organizationId),
      access: await readOrganizationAccess(db, params),
      findWorkOrder: (id: string) =>
        db.workOrder.findFirst({
          where: {
            id,
            organizationId: params.organizationId,
          },
          select: {
            id: true,
            organizationId: true,
            customerId: true,
            customerName: true,
            title: true,
            currency: true,
            totalInCents: true,
            status: true,
          },
        }),
    };
  }
}
