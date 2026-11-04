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

  private findOrganization(db: Prisma.TransactionClient, organizationId: string) {
    return db.organization.findUnique({
      where: {
        id: organizationId,
      },
      select: {
        name: true,
        autoQuoteFollowUpEnabled: true,
      },
    });
  }

  private findCustomer(db: Prisma.TransactionClient, organizationId: string, customerId: string) {
    return db.customer.findFirst({
      where: {
        id: customerId,
        organizationId,
      },
    });
  }

  private findCatalogService(db: Prisma.TransactionClient, organizationId: string, serviceId: string) {
    return db.catalogService.findFirst({
      where: {
        id: serviceId,
        organizationId,
      },
    });
  }

  private async createReadContext(db: Prisma.TransactionClient, params: QuoteActorParams): Promise<QuoteReadContext> {
    const { organizationId } = params;

    return {
      quotes: new PrismaQuoteRepository(db, organizationId),
      shares: new PrismaQuoteShareRepository(db, organizationId),
      access: await readOrganizationAccess(db, params),
      findOrganization: () => this.findOrganization(db, organizationId),
    };
  }

  private async createTransactionContext(
    db: Prisma.TransactionClient,
    params: QuoteActorParams,
    onNotificationInserted: () => void,
  ): Promise<QuoteTransaction> {
    const { organizationId } = params;
    const readContext = await this.createReadContext(db, params);

    return {
      ...readContext,
      quotes: new PrismaQuoteRepository(db, organizationId),
      shares: new PrismaQuoteShareRepository(db, organizationId),
      notifications: this.outbox.using(db, onNotificationInserted),
      workOrders: new PrismaWorkOrderRepository(db, organizationId),
      receivables: new PrismaReceivableRepository(db, organizationId),
      findSingleAssignableMember: () => this.findSingleAssignableMember(db, organizationId),
      findCustomerDefaultServiceAddress: (customerId) =>
        this.findCustomerDefaultServiceAddress(db, organizationId, customerId),
      findCustomer: (customerId) => this.findCustomer(db, organizationId, customerId),
      findCatalogService: (serviceId) => this.findCatalogService(db, organizationId, serviceId),
    };
  }

  private errors() {
    return {
      notFound: () => new QuoteError('ORGANIZATION_NOT_FOUND'),
      busy: () => new QuoteError('QUOTES_BUSY'),
    };
  }
}
