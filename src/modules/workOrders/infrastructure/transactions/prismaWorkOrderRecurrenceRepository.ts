import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { WorkOrderRecurrenceRepository } from '../../application/ports/workOrderRecurrenceRepository.port.js';
import type { WorkOrderActorParams } from '../../application/ports/workOrderUnitOfWork.port.js';
import type { WorkOrderByIdParams } from '../../application/types/workOrder.types.js';
import type {
  WorkOrderRecurrenceListInput,
  WorkOrderRecurrenceListView,
  WorkOrderRecurrenceView,
} from '../../application/types/workOrderRecurrence.types.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import type { WorkOrderRecurrenceSettings } from '../../domain/policies/workOrderRecurrence.policy.js';
import { workOrderRecurrenceDate, WorkOrderRecurrencePolicy } from '../../domain/policies/workOrderRecurrence.policy.js';
import { workOrderRecurrenceVisitFilter } from '../../domain/policies/workOrderRecurrenceVisit.policy.js';

const recurrenceSelect = {
  intervalUnit: true,
  intervalCount: true,
  nextVisitOn: true,
  enabled: true,
  version: true,
} satisfies Prisma.WorkOrderRecurrenceSelect;

const orderSelect = {
  status: true,
  completedAt: true,
  customer: { select: { archivedAt: true } },
  recurrence: { select: recurrenceSelect },
} satisfies Prisma.WorkOrderSelect;

type RecurrenceOrder = Prisma.WorkOrderGetPayload<{ select: typeof orderSelect }>;

@Injectable()
export class PrismaWorkOrderRecurrenceRepository extends WorkOrderRecurrenceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  list(params: WorkOrderActorParams, input: WorkOrderRecurrenceListInput): Promise<WorkOrderRecurrenceListView> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'read',
      async (db) => {
        const access = await readOrganizationAccess(db, params);
        OrganizationAccessPolicy.assertVerifiedMember(access, (code) => new WorkOrderError(code));

        const today = workOrderRecurrenceDate(new Date());
        const { page, limit, status, visit, customerName } = input;
        const archivedAt = status === 'ARCHIVED' ? { not: null } : status === undefined ? undefined : null;
        const enabled = status === 'ACTIVE' ? true : status === 'PAUSED' ? false : undefined;
        const name = customerName?.trim();
        const customer: Prisma.CustomerWhereInput = { archivedAt };

        if (name) {
          customer.name = { contains: name.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' };
        }

        const rows = await db.workOrderRecurrence.findMany({
          where: {
            organizationId: params.organizationId,
            enabled,
            nextVisitOn: workOrderRecurrenceVisitFilter(today, visit),
            workOrder: {
              organizationId: params.organizationId,
              status: 'COMPLETED',
              completedAt: { not: null },
              customer,
            },
          },
          select: {
            ...recurrenceSelect,
            workOrderId: true,
            workOrder: {
              select: {
                title: true,
                customerId: true,
                customer: { select: { name: true, archivedAt: true } },
              },
            },
          },
          orderBy: [{ nextVisitOn: 'asc' }, { workOrderId: 'asc' }],
          skip: (page - 1) * limit,
          take: limit + 1,
        });

        return {
          items: rows.slice(0, limit).map(({ workOrderId, workOrder, nextVisitOn, ...recurrence }) => ({
            workOrderId,
            title: workOrder.title,
            customerId: workOrder.customerId,
            customerName: workOrder.customer.name,
            customerArchived: workOrder.customer.archivedAt !== null,
            recurrence: { ...recurrence, nextVisitOn: nextVisitOn.toISOString().slice(0, 10) },
          })),
          page,
          hasMore: rows.length > limit,
          today,
          canConfigure: access.hasPlatformAccess && !access.billingNeedsReconciliation,
        };
      },
      this.errors(),
    );
  }

  read(params: WorkOrderByIdParams): Promise<WorkOrderRecurrenceView> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'read',
      async (db) => {
        const access = await readOrganizationAccess(db, params);
        OrganizationAccessPolicy.assertVerifiedMember(access, (code) => new WorkOrderError(code));

        return this.toView(await this.findOrder(db, params), access, new Date());
      },
      this.errors(),
    );
  }

  save(params: WorkOrderByIdParams, input: WorkOrderRecurrenceSettings): Promise<WorkOrderRecurrenceView> {
    return organizationTransaction(
      this.prisma,
      params.organizationId,
      'write',
      async (db) => {
        const access = await readOrganizationAccess(db, params);
        OrganizationAccessPolicy.assertCanOperate(access, (code) => new WorkOrderError(code));
        const order = await this.findOrder(db, params);

        if (order.status !== 'COMPLETED' || order.completedAt === null) {
          throw new WorkOrderError('WORK_ORDER_NOT_COMPLETED');
        }

        if (order.customer.archivedAt !== null && (order.recurrence === null || input.enabled)) {
          throw new WorkOrderError('WORK_ORDER_RECURRENCE_CUSTOMER_ARCHIVED');
        }

        const now = new Date();
        const settings = WorkOrderRecurrencePolicy.configure(
          input,
          order.recurrence?.version ?? 0,
          order.completedAt,
          now,
        );
        const data = {
          ...settings,
          nextVisitOn: new Date(`${settings.nextVisitOn}T00:00:00.000Z`),
          updatedById: params.userId,
        };

        if (order.recurrence === null) {
          await db.workOrderRecurrence.create({
            data: {
              ...data,
              workOrderId: params.workOrderId,
              organizationId: params.organizationId,
              createdById: params.userId,
            },
          });
        } else {
          const updated = await db.workOrderRecurrence.updateMany({
            where: {
              workOrderId: params.workOrderId,
              organizationId: params.organizationId,
              version: input.version,
            },
            data,
          });

          if (updated.count !== 1) {
            throw new WorkOrderError('WORK_ORDER_RECURRENCE_VERSION_CONFLICT');
          }
        }

        return { ...this.toView(order, access, now), recurrence: settings };
      },
      this.errors(),
    );
  }

  private async findOrder(db: Prisma.TransactionClient, params: WorkOrderByIdParams): Promise<RecurrenceOrder> {
    const order = await db.workOrder.findFirst({
      where: { id: params.workOrderId, organizationId: params.organizationId },
      select: orderSelect,
    });

    if (order === null) {
      throw new WorkOrderError('WORK_ORDER_NOT_FOUND');
    }

    return order;
  }

  private toView(order: RecurrenceOrder, access: OrganizationAccessContext, now: Date): WorkOrderRecurrenceView {
    const completed = order.status === 'COMPLETED' && order.completedAt !== null;
    const customerArchived = order.customer.archivedAt !== null;

    return {
      recurrence:
        order.recurrence === null
          ? null
          : {
              ...order.recurrence,
              nextVisitOn: order.recurrence.nextVisitOn.toISOString().slice(0, 10),
            },
      canConfigure:
        completed &&
        access.hasPlatformAccess &&
        !access.billingNeedsReconciliation &&
        (!customerArchived || order.recurrence !== null),
      customerArchived,
      today: workOrderRecurrenceDate(now),
      completedOn: order.completedAt === null ? null : workOrderRecurrenceDate(order.completedAt),
    };
  }

  private errors() {
    return {
      notFound: () => new WorkOrderError('ORGANIZATION_NOT_FOUND'),
      busy: () => new WorkOrderError('WORK_ORDERS_BUSY'),
    };
  }
}
