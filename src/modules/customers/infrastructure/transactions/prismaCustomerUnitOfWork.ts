import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import {
  organizationTransaction,
  OrganizationTransactionMode,
} from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import type {
  CustomerActorParams,
  CustomerReadContext,
  CustomerTransaction,
} from '../../application/ports/customerUnitOfWork.port.js';
import { CustomerUnitOfWork } from '../../application/ports/customerUnitOfWork.port.js';
import { CustomerError } from '../../domain/errors/customer.error.js';
import { PrismaCustomerRepository } from '../repositories/prismaCustomer.repository.js';

@Injectable()
export class PrismaCustomerUnitOfWork extends CustomerUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read<T>(params: CustomerActorParams, operation: (context: CustomerReadContext) => Promise<T>): Promise<T> {
    return this.execute('read', params, operation);
  }

  run<T>(params: CustomerActorParams, operation: (tx: CustomerTransaction) => Promise<T>): Promise<T> {
    return this.execute('write', params, operation);
  }

  private execute<T>(
    mode: OrganizationTransactionMode,
    params: CustomerActorParams,
    operation: (tx: CustomerTransaction) => Promise<T>,
  ): Promise<T> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      mode,
      async (db) => operation(await this.createContext(db, params)),
      {
        notFound: () => new CustomerError('ORGANIZATION_NOT_FOUND'),
        busy: () => new CustomerError('CUSTOMERS_BUSY'),
      },
    );
  }

  private async createContext(db: Prisma.TransactionClient, params: CustomerActorParams): Promise<CustomerTransaction> {
    return {
      customers: new PrismaCustomerRepository(db, params.organizationId),
      access: await readOrganizationAccess(db, params),
    };
  }
}
