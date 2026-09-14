import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import {
  organizationTransaction,
  OrganizationTransactionMode,
} from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import type {
  CatalogServiceActorParams,
  CatalogServiceReadContext,
  CatalogServiceTransaction,
} from '../../application/ports/catalogServiceUnitOfWork.port.js';
import { CatalogServiceUnitOfWork } from '../../application/ports/catalogServiceUnitOfWork.port.js';
import { CatalogServiceError } from '../../domain/errors/catalogService.error.js';
import { PrismaCatalogServiceRepository } from '../repositories/prismaCatalogService.repository.js';

@Injectable()
export class PrismaCatalogServiceUnitOfWork extends CatalogServiceUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read<T>(
    params: CatalogServiceActorParams,
    operation: (context: CatalogServiceReadContext) => Promise<T>,
  ): Promise<T> {
    return this.execute('read', params, operation);
  }

  run<T>(params: CatalogServiceActorParams, operation: (tx: CatalogServiceTransaction) => Promise<T>): Promise<T> {
    return this.execute('write', params, operation);
  }

  private execute<T>(
    mode: OrganizationTransactionMode,
    params: CatalogServiceActorParams,
    operation: (tx: CatalogServiceTransaction) => Promise<T>,
  ): Promise<T> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      mode,
      async (db) => operation(await this.createContext(db, params)),
      {
        notFound: () => new CatalogServiceError('ORGANIZATION_NOT_FOUND'),
        busy: () => new CatalogServiceError('CATALOG_BUSY'),
      },
    );
  }

  private async createContext(
    db: Prisma.TransactionClient,
    params: CatalogServiceActorParams,
  ): Promise<CatalogServiceTransaction> {
    return {
      catalogServices: new PrismaCatalogServiceRepository(db, params.organizationId),
      access: await readOrganizationAccess(db, params),
    };
  }
}
