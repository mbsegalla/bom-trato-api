import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PrismaInAppNotificationRepository } from '../../../notifications/infrastructure/repositories/prismaInAppNotification.repository.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import type { WorkOrderRecurrenceReminderCandidate } from '../../application/ports/workOrderRecurrenceReminder.port.js';
import { WorkOrderRecurrenceReminderRepository } from '../../application/ports/workOrderRecurrenceReminder.port.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import { workOrderRecurrenceDate } from '../../domain/policies/workOrderRecurrence.policy.js';
import {
  resolveWorkOrderRecurrenceReminderStage,
  workOrderRecurrenceReminderKey,
  workOrderRecurrenceReminderWindow,
} from '../../domain/policies/workOrderRecurrenceReminder.policy.js';

@Injectable()
export class PrismaWorkOrderRecurrenceReminderRepository extends WorkOrderRecurrenceReminderRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  listCandidates(today: string, limit: number, afterId?: string): Promise<WorkOrderRecurrenceReminderCandidate[]> {
    const { from, to } = workOrderRecurrenceReminderWindow(today);

    return this.prisma.workOrderRecurrence.findMany({
      where: {
        enabled: true,
        nextVisitOn: { gte: from, lte: to },
        workOrderId: afterId === undefined ? undefined : { gt: afterId },
        workOrder: {
          status: 'COMPLETED',
          completedAt: { not: null },
          quote: { status: 'APPROVED' },
          customer: { archivedAt: null },
        },
      },
      select: { workOrderId: true, organizationId: true },
      orderBy: { workOrderId: 'asc' },
      take: limit,
    });
  }

  async enqueue({ workOrderId, organizationId }: WorkOrderRecurrenceReminderCandidate): Promise<void> {
    await organizationTransaction(
      this.prisma,
      organizationId,
      'write',
      async (db) => {
        const plan = await db.workOrderRecurrence.findFirst({
          where: {
            workOrderId,
            organizationId,
            enabled: true,
            workOrder: {
              organizationId,
              status: 'COMPLETED',
              completedAt: { not: null },
              quote: { status: 'APPROVED' },
              customer: { archivedAt: null },
            },
          },
          select: {
            nextVisitOn: true,
            autoGenerateEnabled: true,
            workOrder: {
              select: {
                title: true,
                customer: { select: { name: true } },
                organization: { select: { ownerId: true, setupCompletedAt: true } },
              },
            },
          },
        });

        if (plan === null || plan.workOrder.organization.setupCompletedAt === null) {
          return;
        }

        const today = workOrderRecurrenceDate(new Date());
        const visitOn = plan.nextVisitOn.toISOString().slice(0, 10);
        const stage = resolveWorkOrderRecurrenceReminderStage(visitOn, today, plan.autoGenerateEnabled);

        if (stage === null) {
          return;
        }

        const userId = plan.workOrder.organization.ownerId;
        const access = await readOrganizationAccess(db, { organizationId, userId });

        if (!access.isMember || !access.verified || !access.hasPlatformAccess || access.billingNeedsReconciliation) {
          return;
        }

        const generated = await db.workOrderRecurrenceGeneration.findFirst({
          where: { organizationId, workOrderId, visitOn: plan.nextVisitOn },
          select: { quoteId: true },
        });

        if (generated !== null) {
          return;
        }

        const titles = {
          UPCOMING: 'Serviço recorrente próximo',
          DUE: 'Serviço recorrente previsto para hoje',
          OVERDUE: 'Serviço recorrente com data vencida',
        };
        const date = visitOn.split('-').reverse().join('/');
        const { title, customer } = plan.workOrder;

        await new PrismaInAppNotificationRepository(db).enqueue({
          key: workOrderRecurrenceReminderKey(organizationId, workOrderId, userId, visitOn, stage),
          organizationId,
          userId,
          type: 'WORK_ORDER_RECURRENCE_REMINDER',
          title: titles[stage],
          message: `O serviço "${title}" de ${customer.name} tem visita prevista em ${date}. Confira a recorrência.`,
          href: `/work-orders/${workOrderId}#recurrence`,
        });
      },
      {
        notFound: () => new WorkOrderError('ORGANIZATION_NOT_FOUND'),
        busy: () => new WorkOrderError('WORK_ORDERS_BUSY'),
      },
    );
  }
}
