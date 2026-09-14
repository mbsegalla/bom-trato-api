import type { Prisma } from '../../../../generated/prisma/client.js';
import type { WorkOrder } from '../../domain/entities/workOrder.entity.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import { WorkOrderRepository } from '../../domain/repositories/workOrder.repository.js';
import type { WorkOrderPageParams, WorkOrderProps } from '../../domain/types/workOrder.types.js';

const include = {
  workOrderItems: {
    orderBy: {
      position: 'asc',
    },
    select: {
      id: true,
      sourceQuoteItemId: true,
      name: true,
      description: true,
      unit: true,
      quantityInThousandths: true,
      unitAmountInCents: true,
      totalInCents: true,
      position: true,
    },
  },
} satisfies Prisma.WorkOrderInclude;

type WorkOrderRow = Prisma.WorkOrderGetPayload<{ include: typeof include }>;

export class PrismaWorkOrderRepository extends WorkOrderRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly organizationId: string,
  ) {
    super();
  }

  async create(order: WorkOrder): Promise<void> {
    const { items, ...state } = this.scopedState(order);

    await this.db.workOrder.create({
      data: {
        ...state,
        workOrderItems: {
          create: items,
        },
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: state.status,
            actorId: state.createdById,
            version: state.version,
            reason: null,
            createdAt: state.createdAt,
          },
        },
      },
    });
  }

  async findById(id: string): Promise<WorkOrderProps | null> {
    const row = await this.db.workOrder.findFirst({
      where: {
        id,
        organizationId: this.organizationId,
      },
      include,
    });

    return row === null ? null : this.toProps(row);
  }

  async findByQuoteId(quoteId: string): Promise<WorkOrderProps | null> {
    const row = await this.db.workOrder.findFirst({
      where: {
        quoteId,
        organizationId: this.organizationId,
      },
      include,
    });

    return row === null ? null : this.toProps(row);
  }

  async list(params: WorkOrderPageParams) {
    const rows = await this.db.workOrder.findMany({
      where: {
        organizationId: this.organizationId,
        status: params.status,
        customerId: params.customerId,
        assignedToId: params.assignedToId,
        scheduledStartAt: {
          gte: params.scheduledFrom,
          lte: params.scheduledTo,
        },
      },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (params.page - 1) * params.limit,
      take: params.limit + 1,
    });

    return {
      items: rows.slice(0, params.limit).map((row) => this.toProps(row)),
      page: params.page,
      hasMore: rows.length > params.limit,
    };
  }

  async save(order: WorkOrder, expectedVersion: number): Promise<void> {
    const state = this.scopedState(order);

    const previous = await this.db.workOrder.findFirst({
      where: {
        id: state.id,
        organizationId: this.organizationId,
        version: expectedVersion,
      },
      select: {
        status: true,
      },
    });

    if (previous === null) {
      throw new WorkOrderError('WORK_ORDER_VERSION_CONFLICT');
    }

    const result = await this.db.workOrder.updateMany({
      where: {
        id: state.id,
        organizationId: this.organizationId,
        version: expectedVersion,
      },
      data: {
        title: state.title,
        instructions: state.instructions,
        serviceAddress: state.serviceAddress,
        executionNotes: state.executionNotes,
        assignedToId: state.assignedToId,
        status: state.status,
        scheduledStartAt: state.scheduledStartAt,
        scheduledEndAt: state.scheduledEndAt,
        startedAt: state.startedAt,
        completedAt: state.completedAt,
        canceledAt: state.canceledAt,
        cancellationReason: state.cancellationReason,
        version: state.version,
        updatedById: state.updatedById,
        updatedAt: state.updatedAt,
      },
    });

    if (result.count !== 1) {
      throw new WorkOrderError('WORK_ORDER_VERSION_CONFLICT');
    }

    if (previous.status !== state.status) {
      await this.db.workOrderStatusHistory.create({
        data: {
          workOrderId: state.id,
          fromStatus: previous.status,
          toStatus: state.status,
          actorId: state.updatedById,
          version: state.version,
          reason: state.cancellationReason,
          createdAt: state.updatedAt,
        },
      });
    }
  }

  async listStatusHistory(workOrderId: string) {
    const order = await this.db.workOrder.findFirst({
      where: {
        id: workOrderId,
        organizationId: this.organizationId,
      },
      select: {
        id: true,
      },
    });

    if (order === null) {
      throw new WorkOrderError('WORK_ORDER_NOT_FOUND');
    }

    return this.db.workOrderStatusHistory.findMany({
      where: {
        workOrderId,
        workOrder: {
          organizationId: this.organizationId,
        },
      },
      orderBy: [{ version: 'asc' }, { id: 'asc' }],
    });
  }

  private toProps(row: WorkOrderRow): WorkOrderProps {
    const { workOrderItems, ...state } = row;

    return {
      ...state,
      items: workOrderItems,
    };
  }

  private scopedState(order: WorkOrder): WorkOrderProps {
    const state = order.snapshot();

    if (state.organizationId !== this.organizationId) {
      throw new WorkOrderError('WORK_ORDER_NOT_FOUND');
    }

    return state;
  }
}
