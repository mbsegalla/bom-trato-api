import type { Prisma } from '../../../../generated/prisma/client.js';
import { ReceivableStatus } from '../../../../generated/prisma/enums.js';
import type { Receivable, ReceivableProps } from '../../domain/entities/receivable.entity.js';
import type { ReceivablePayment } from '../../domain/entities/receivablePayment.entity.js';
import { ReceivableError } from '../../domain/errors/receivable.error.js';
import { ReceivableRepository } from '../../domain/repositories/receivable.repository.js';
import type { ReceivablePageParams, ReceivablePagination } from '../../domain/types/receivablePage.types.js';

export class PrismaReceivableRepository extends ReceivableRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly organizationId: string,
  ) {
    super();
  }

  async create(receivable: Receivable): Promise<void> {
    await this.db.receivable.create({
      data: this.scopedState(receivable),
    });
  }

  findById(id: string) {
    return this.db.receivable.findFirst({
      where: {
        id,
        organizationId: this.organizationId,
      },
    });
  }

  findByWorkOrderId(workOrderId: string) {
    return this.db.receivable.findFirst({
      where: {
        workOrderId,
        organizationId: this.organizationId,
      },
    });
  }

  async list(params: ReceivablePageParams) {
    const where: Prisma.ReceivableWhereInput = {
      organizationId: this.organizationId,
      status: params.status,
      customerId: params.customerId,
      workOrderId: params.workOrderId,
      dueAt: {
        gte: params.dueFrom,
        lte: params.dueTo,
      },
    };

    if (params.overdue === true) {
      where.AND = [
        {
          status: {
            in: [ReceivableStatus.OPEN, ReceivableStatus.PARTIALLY_PAID],
          },
        },
        { dueAt: { lt: params.now } },
      ];
    } else if (params.overdue === false) {
      where.AND = [
        {
          OR: [
            {
              status: {
                in: [ReceivableStatus.PAID, ReceivableStatus.CANCELED],
              },
            },
            { dueAt: { gte: params.now } },
          ],
        },
      ];
    }

    const rows = await this.db.receivable.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (params.page - 1) * params.limit,
      take: params.limit + 1,
    });

    return {
      items: rows.slice(0, params.limit),
      page: params.page,
      hasMore: rows.length > params.limit,
    };
  }

  async save(receivable: Receivable, expectedVersion: number): Promise<void> {
    const state = this.scopedState(receivable);

    if (state.version !== expectedVersion + 1) {
      throw new ReceivableError('RECEIVABLE_VERSION_CONFLICT');
    }

    const result = await this.db.receivable.updateMany({
      where: {
        id: state.id,
        organizationId: this.organizationId,
        version: expectedVersion,
      },
      data: {
        receivedInCents: state.receivedInCents,
        status: state.status,
        dueAt: state.dueAt,
        notes: state.notes,
        canceledAt: state.canceledAt,
        canceledById: state.canceledById,
        cancellationReason: state.cancellationReason,
        version: state.version,
        updatedById: state.updatedById,
        updatedAt: state.updatedAt,
      },
    });

    if (result.count !== 1) {
      throw new ReceivableError('RECEIVABLE_VERSION_CONFLICT');
    }
  }

  findPaymentById(receivableId: string, paymentId: string) {
    return this.db.receivablePayment.findFirst({
      where: {
        id: paymentId,
        receivableId,
        receivable: {
          organizationId: this.organizationId,
        },
      },
    });
  }

  findPaymentByRequestId(receivableId: string, requestId: string) {
    return this.db.receivablePayment.findFirst({
      where: {
        receivableId,
        requestId,
        receivable: {
          organizationId: this.organizationId,
        },
      },
    });
  }

  async createPayment(payment: ReceivablePayment): Promise<void> {
    const { receivableId, ...state } = payment.snapshot();

    await this.db.receivablePayment.create({
      data: {
        ...state,
        receivable: {
          connect: {
            id: receivableId,
            organizationId: this.organizationId,
          },
        },
      },
    });
  }

  async savePaymentReversal(payment: ReceivablePayment): Promise<void> {
    const state = payment.snapshot();

    if (state.reversedAt === null || state.reversedById === null || state.reversalReason === null) {
      throw new ReceivableError('INVALID_RECEIVABLE_INPUT');
    }

    const result = await this.db.receivablePayment.updateMany({
      where: {
        id: state.id,
        receivableId: state.receivableId,
        reversedAt: null,
        receivable: {
          organizationId: this.organizationId,
        },
      },
      data: {
        reversedAt: state.reversedAt,
        reversedById: state.reversedById,
        reversalReason: state.reversalReason,
      },
    });

    if (result.count !== 1) {
      throw new ReceivableError('PAYMENT_ALREADY_REVERSED');
    }
  }

  async listPayments(receivableId: string, params: ReceivablePagination) {
    const rows = await this.db.receivablePayment.findMany({
      where: {
        receivableId,
        receivable: {
          organizationId: this.organizationId,
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (params.page - 1) * params.limit,
      take: params.limit + 1,
    });

    return {
      items: rows.slice(0, params.limit),
      page: params.page,
      hasMore: rows.length > params.limit,
    };
  }

  private scopedState(receivable: Receivable): ReceivableProps {
    const state = receivable.snapshot();

    if (state.organizationId !== this.organizationId) {
      throw new ReceivableError('RECEIVABLE_NOT_FOUND');
    }

    return state;
  }
}
