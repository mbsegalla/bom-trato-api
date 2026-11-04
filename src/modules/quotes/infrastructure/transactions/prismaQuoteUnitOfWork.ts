import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PrismaNotificationOutbox } from '../../../notifications/infrastructure/repositories/prismaNotificationOutbox.repository.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { PrismaReceivableRepository } from '../../../receivables/infrastructure/repositories/prismaReceivable.repository.js';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: PrismaNotificationOutbox,
  ) {
    super();
  }

  read<T>(params: QuoteActorParams, operation: (context: QuoteReadContext) => Promise<T>): Promise<T> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'read',
      async (db) => operation(await this.createReadContext(db, params)),
      this.errors(),
    );
  }

  async run<T>(params: QuoteActorParams, operation: (tx: QuoteTransaction) => Promise<T>): Promise<T> {
    let notificationInserted = false;

    const result = await organizationTransaction(
      this.prisma,
      params.organizationId,
      'write',
      async (db) =>
        operation(
          await this.createTransactionContext(db, params, () => {
            notificationInserted = true;
          }),
        ),
      this.errors(),
    );

    if (notificationInserted) {
      this.outbox.notifyWorker();
    }

    return result;
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

  private async createReadContext(db: Prisma.TransactionClient, params: QuoteActorParams): Promise<QuoteReadContext> {
    return {
      quotes: new PrismaQuoteRepository(db, params.organizationId),
      shares: new PrismaQuoteShareRepository(db, params.organizationId),
      access: await readOrganizationAccess(db, params),
      findOrganization: () =>
        db.organization.findUnique({
          where: {
            id: params.organizationId,
          },
          select: {
            name: true,
            autoQuoteFollowUpEnabled: true,
          },
        }),
    };
  }

  private async createTransactionContext(
    db: Prisma.TransactionClient,
    params: QuoteActorParams,
    onNotificationInserted: () => void,
  ): Promise<QuoteTransaction> {
    const readContext = await this.createReadContext(db, params);

    return {
      ...readContext,
      quotes: new PrismaQuoteRepository(db, params.organizationId),
      shares: new PrismaQuoteShareRepository(db, params.organizationId),
      notifications: this.outbox.using(db, onNotificationInserted),
      workOrders: new PrismaWorkOrderRepository(db, params.organizationId),
      receivables: new PrismaReceivableRepository(db, params.organizationId),
      findSingleAssignableMember: () => this.findSingleAssignableMember(db, params.organizationId),
      findCustomerDefaultServiceAddress: (customerId) =>
        this.findCustomerDefaultServiceAddress(db, params.organizationId, customerId),
      findCustomer: (id) =>
        db.customer.findFirst({
          where: {
            id,
            organizationId: params.organizationId,
          },
        }),
      findCatalogService: (id) =>
        db.catalogService.findFirst({
          where: {
            id,
            organizationId: params.organizationId,
          },
        }),
    };
  }

  private errors() {
    return {
      notFound: () => new QuoteError('ORGANIZATION_NOT_FOUND'),
      busy: () => new QuoteError('QUOTES_BUSY'),
    };
  }
}
