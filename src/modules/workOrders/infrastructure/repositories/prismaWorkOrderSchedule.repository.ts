import type { Prisma } from '../../../../generated/prisma/client.js';
import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import type { Page } from '../../../../shared/types/page.types.js';
import { WorkOrderScheduleRepository } from '../../application/ports/workOrderScheduleRepository.port.js';
import type { WorkOrderScheduleItem, WorkOrderScheduleQuery } from '../../application/types/workOrderSchedule.types.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';

export class PrismaWorkOrderScheduleRepository extends WorkOrderScheduleRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly organizationId: string,
  ) {
    super();
  }

  async list(params: WorkOrderScheduleQuery): Promise<Page<WorkOrderScheduleItem>> {
    const { page, limit, from, to, now, assignedToId, status, late } = params;

    const lateWhere: Prisma.WorkOrderWhereInput = {
      status: WorkOrderStatus.SCHEDULED,
      startedAt: null,
      scheduledStartAt: { lt: now },
    };

    const rows = await this.db.workOrder.findMany({
      where: {
        organizationId: this.organizationId,
        assignedToId,
        status: status ?? {
          in: [WorkOrderStatus.SCHEDULED, WorkOrderStatus.IN_PROGRESS],
        },
        scheduledStartAt: { lt: to },
        scheduledEndAt: { gt: from },
        ...(late === true ? { AND: [lateWhere] } : {}),
        ...(late === false ? { NOT: lateWhere } : {}),
      },
      select: {
        id: true,
        customerId: true,
        customerName: true,
        title: true,
        serviceAddress: true,
        assignedToId: true,
        assignedTo: {
          select: {
            name: true,
          },
        },
        status: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        startedAt: true,
        version: true,
      },
      orderBy: [{ scheduledStartAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit + 1,
    });

    return {
      page,
      hasMore: rows.length > limit,
      items: rows.slice(0, limit).map((row) => {
        const { assignedTo, scheduledStartAt, scheduledEndAt, ...state } = row;

        if (scheduledStartAt === null || scheduledEndAt === null) {
          throw new WorkOrderError('INVALID_WORK_ORDER_SCHEDULE');
        }

        return {
          ...state,
          scheduledStartAt,
          scheduledEndAt,
          assignedToName: assignedTo?.name ?? null,
          late: row.status === WorkOrderStatus.SCHEDULED && row.startedAt === null && scheduledStartAt < now,
        };
      }),
    };
  }
}
