import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import {
  organizationTransaction,
  OrganizationTransactionMode,
} from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { PrismaWorkOrderRepository } from '../../../workOrders/infrastructure/repositories/prismaWorkOrder.repository.js';
import type {
  QuoteActorParams,
  QuoteReadContext,
  QuoteTransaction,
} from '../../application/ports/quoteUnitOfWork.port.js';
import { QuoteUnitOfWork } from '../../application/ports/quoteUnitOfWork.port.js';
import { QuoteError } from '../../domain/errors/quote.error.js';
import { PrismaQuoteRepository } from '../repositories/prismaQuote.repository.js';
import { PrismaQuoteShareRepository } from '../repositories/prismaQuoteShare.repository.js';

@Injectable()
export class PrismaQuoteUnitOfWork extends QuoteUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read<T>(params: QuoteActorParams, operation: (context: QuoteReadContext) => Promise<T>): Promise<T> {
    return this.execute('read', params, operation);
  }

  run<T>(params: QuoteActorParams, operation: (tx: QuoteTransaction) => Promise<T>): Promise<T> {
    return this.execute('write', params, operation);
  }

  private execute<T>(
    mode: OrganizationTransactionMode,
    params: QuoteActorParams,
    operation: (tx: QuoteTransaction) => Promise<T>,
  ): Promise<T> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      mode,
      async (db) => operation(await this.createContext(db, params)),
      {
        notFound: () => new QuoteError('ORGANIZATION_NOT_FOUND'),
        busy: () => new QuoteError('QUOTES_BUSY'),
      },
    );
  }

  private async findSingleAssignableMember(
    db: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string | null> {
    const members = await db.organizationMember.findMany({
      where: {
        organizationId,
        user: {
          disabledAt: null,
          emailVerifiedAt: {
            not: null,
          },
        },
      },
      select: {
        userId: true,
      },
      take: 2,
    });

    if (members.length !== 1) {
      return null;
    }

    return members[0].userId;
  }

  private async findCustomerDefaultServiceAddress(
    db: Prisma.TransactionClient,
    organizationId: string,
    customerId: string,
  ): Promise<string | null> {
    const customer = await db.customer.findFirst({
      where: {
        id: customerId,
        organizationId,
      },
      select: {
        defaultServiceAddress: true,
      },
    });

    return customer?.defaultServiceAddress ?? null;
  }

  private async createContext(db: Prisma.TransactionClient, params: QuoteActorParams): Promise<QuoteTransaction> {
    return {
      quotes: new PrismaQuoteRepository(db, params.organizationId),
      shares: new PrismaQuoteShareRepository(db, params.organizationId),
      access: await readOrganizationAccess(db, params),
      workOrders: new PrismaWorkOrderRepository(db, params.organizationId),
      findSingleAssignableMember: () => this.findSingleAssignableMember(db, params.organizationId),
      findCustomerDefaultServiceAddress: (customerId) =>
        this.findCustomerDefaultServiceAddress(db, params.organizationId, customerId),
      findOrganization: () =>
        db.organization.findUnique({
          where: {
            id: params.organizationId,
          },
          select: {
            name: true,
          },
        }),
      findCustomer: (id: string) =>
        db.customer.findFirst({
          where: {
            id,
            organizationId: params.organizationId,
          },
        }),
      findCatalogService: (id: string) =>
        db.catalogService.findFirst({
          where: {
            id,
            organizationId: params.organizationId,
          },
        }),
    };
  }
}
