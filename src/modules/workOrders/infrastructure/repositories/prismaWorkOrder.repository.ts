import { type Prisma, WorkOrderStatus } from '../../../../generated/prisma/client.js';
import type { Page, PageParams } from '../../../../shared/types/page.types.js';
import type { WorkOrder } from '../../domain/entities/workOrder.entity.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import { WorkOrderRepository } from '../../domain/repositories/workOrder.repository.js';
import type { WorkOrderPage, WorkOrderPageParams, WorkOrderProps } from '../../domain/types/workOrder.types.js';
import type {
  WorkOrderScheduleHistoryProps,
  WorkOrderScheduleSlot,
} from '../../domain/types/workOrderSchedule.types.js';
import type { WorkOrderSummary } from '../../domain/types/workOrderSummary.types.js';

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

const summarySelect = {
  id: true,
  organizationId: true,
  quoteId: true,
  customerId: true,
  customerName: true,
  title: true,
  assignedToId: true,
  status: true,
  currency: true,
  totalInCents: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkOrderSelect;

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
        workOrderStatusHistory: {
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

  async list(params: WorkOrderPageParams): Promise<WorkOrderPage<WorkOrderSummary>> {
    const { page, limit, status, customerId, assignedToId, scheduledFrom, scheduledTo } = params;

    const rows = await this.db.workOrder.findMany({
      where: {
        organizationId: this.organizationId,
        status,
        customerId,
        assignedToId,
        scheduledStartAt: {
          gte: scheduledFrom,
          lte: scheduledTo,
        },
      },
      select: summarySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit + 1,
    });

    return {
      items: rows.slice(0, limit),
      page,
      hasMore: rows.length > limit,
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
        assignedToId: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
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

    const scheduleChanged =
      previous.assignedToId !== state.assignedToId ||
      previous.scheduledStartAt?.getTime() !== state.scheduledStartAt?.getTime() ||
      previous.scheduledEndAt?.getTime() !== state.scheduledEndAt?.getTime() ||
      previous.status !== state.status;

    if (scheduleChanged && (previous.scheduledStartAt !== null || state.scheduledStartAt !== null)) {
      await this.db.workOrderScheduleHistory.create({
        data: {
          workOrderId: state.id,
          fromAssignedToId: previous.assignedToId,
          toAssignedToId: state.assignedToId,
          fromStartAt: previous.scheduledStartAt,
          fromEndAt: previous.scheduledEndAt,
          toStartAt: state.scheduledStartAt,
          toEndAt: state.scheduledEndAt,
          fromStatus: previous.status,
          toStatus: state.status,
          actorId: state.updatedById,
          version: state.version,
          createdAt: state.updatedAt,
        },
      });
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

  async hasScheduleConflict(slot: WorkOrderScheduleSlot): Promise<boolean> {
    const conflict = await this.db.workOrder.findFirst({
      where: {
        organizationId: this.organizationId,
        id: {
          not: slot.workOrderId,
        },
        assignedToId: slot.assignedToId,
        status: {
          in: [WorkOrderStatus.SCHEDULED, WorkOrderStatus.IN_PROGRESS],
        },
        scheduledStartAt: {
          lt: slot.end,
        },
        scheduledEndAt: {
          gt: slot.start,
        },
      },
      select: {
        id: true,
      },
    });

    return conflict !== null;
  }

  async listScheduleHistory(workOrderId: string, params: PageParams): Promise<Page<WorkOrderScheduleHistoryProps>> {
    const { page, limit } = params;

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

    const rows = await this.db.workOrderScheduleHistory.findMany({
      where: {
        workOrderId,
        workOrder: {
          organizationId: this.organizationId,
        },
      },
      orderBy: {
        version: 'desc',
      },
      skip: (page - 1) * limit,
      take: limit + 1,
    });

    return {
      items: rows.slice(0, limit),
      page,
      hasMore: rows.length > limit,
    };
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
