import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { appConfig } from '../../../../config/app.config.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PrismaInAppNotificationRepository } from '../../../notifications/infrastructure/repositories/prismaInAppNotification.repository.js';
import { readOrganizationAccess } from '../../../organizations/infrastructure/access/prismaOrganizationAccess.js';
import { organizationTransaction } from '../../../organizations/infrastructure/transactions/organizationTransaction.js';
import { createRepeatedWorkOrderQuote } from '../../../quotes/application/services/repeatedWorkOrderQuote.service.js';
import { PrismaQuoteRepository } from '../../../quotes/infrastructure/repositories/prismaQuote.repository.js';
import type { DueWorkOrderRecurrence } from '../../application/ports/workOrderRecurrenceGeneration.port.js';
import { WorkOrderRecurrenceGeneration } from '../../application/ports/workOrderRecurrenceGeneration.port.js';
import { WorkOrderError } from '../../domain/errors/workOrder.error.js';
import { workOrderRecurrenceDate } from '../../domain/policies/workOrderRecurrence.policy.js';
import { nextWorkOrderRecurrenceVisit } from '../../domain/policies/workOrderRecurrenceGeneration.policy.js';
import { workOrderRecurringQuoteNotificationKey } from '../../domain/policies/workOrderRecurrenceReminder.policy.js';
import { PrismaWorkOrderRepository } from '../repositories/prismaWorkOrder.repository.js';

@Injectable()
export class PrismaWorkOrderRecurrenceGeneration extends WorkOrderRecurrenceGeneration {
  constructor(
    private readonly prisma: PrismaService,

    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {
    super();
  }

  listDue(today: string, limit: number, afterId?: string): Promise<DueWorkOrderRecurrence[]> {
    return this.prisma.workOrderRecurrence.findMany({
      where: {
        autoGenerateEnabled: true,
        enabled: true,
        nextVisitOn: { lte: new Date(`${today}T00:00:00.000Z`) },
        workOrderId: afterId === undefined ? undefined : { gt: afterId },
        workOrder: {
          status: 'COMPLETED',
          completedAt: { not: null },
          customer: { archivedAt: null },
        },
      },
      select: { workOrderId: true, organizationId: true },
      orderBy: { workOrderId: 'asc' },
      take: limit,
    });
  }

  async generate({ workOrderId, organizationId }: DueWorkOrderRecurrence): Promise<void> {
    await organizationTransaction(
      this.prisma,
      organizationId,
      'write',
      async (db) => {
        const now = new Date();
        const today = workOrderRecurrenceDate(now);
        const plan = await db.workOrderRecurrence.findFirst({
          where: { workOrderId, organizationId, enabled: true, autoGenerateEnabled: true },
        });

        if (plan === null || plan.nextVisitOn > new Date(`${today}T00:00:00.000Z`)) {
          return;
        }

        const organization = await db.organization.findUnique({
          where: { id: organizationId },
          select: { ownerId: true, setupCompletedAt: true },
        });

        if (organization === null || organization.setupCompletedAt === null) {
          return;
        }

        const params = { organizationId, userId: organization.ownerId };
        const access = await readOrganizationAccess(db, params);

        if (!access.isMember || !access.verified || !access.hasPlatformAccess || access.billingNeedsReconciliation) {
          return;
        }

        const orders = new PrismaWorkOrderRepository(db, organizationId);
        const quotes = new PrismaQuoteRepository(db, organizationId);
        const workOrder = await orders.findById(workOrderId);

        if (workOrder === null || workOrder.status !== 'COMPLETED' || workOrder.completedAt === null) {
          return;
        }

        const customer = await db.customer.findFirst({
          where: { id: workOrder.customerId, organizationId, archivedAt: null },
          select: { id: true, name: true, email: true, phone: true, archivedAt: true },
        });
        const source = await quotes.findById(workOrder.quoteId);

        if (customer === null || source === null || source.status !== 'APPROVED') {
          return;
        }

        if (plan.version >= 2147483647) {
          throw new WorkOrderError('WORK_ORDER_RECURRENCE_VERSION_CONFLICT');
        }

        const visitOn = plan.nextVisitOn.toISOString().slice(0, 10);
        const nextVisitOn = nextWorkOrderRecurrenceVisit(visitOn, today, plan.intervalUnit, plan.intervalCount);
        const existing = await db.workOrderRecurrenceGeneration.findFirst({
          where: { organizationId, workOrderId, visitOn: plan.nextVisitOn },
          select: { quoteId: true },
        });

        if (existing === null) {
          const quote = createRepeatedWorkOrderQuote(params, source, workOrder, customer, now);

          const quoteId = quote.snapshot().id;

          await quotes.create(quote);
          await db.workOrderRecurrenceGeneration.create({
            data: { workOrderId, organizationId, visitOn: plan.nextVisitOn, quoteId, createdAt: now },
          });

          if (this.config.workOrderRecurrenceReminderWorkerEnabled) {
            const date = visitOn.split('-').reverse().join('/');

            await new PrismaInAppNotificationRepository(db).enqueue({
              key: workOrderRecurringQuoteNotificationKey(organizationId, quoteId),
              userId: params.userId,
              organizationId,
              type: 'WORK_ORDER_RECURRING_QUOTE_CREATED',
              title: 'Orçamento recorrente gerado',
              message: `O orçamento de "${workOrder.title}" para ${customer.name} (visita de ${date}) está em rascunho. Confira os preços antes de enviar.`,
              href: `/quotes/${quoteId}`,
            });
          }
        }

        const updated = await db.workOrderRecurrence.updateMany({
          where: { workOrderId, organizationId, version: plan.version, enabled: true, autoGenerateEnabled: true },
          data: {
            nextVisitOn: new Date(`${nextVisitOn}T00:00:00.000Z`),
            version: { increment: 1 },
            updatedById: params.userId,
          },
        });

        if (updated.count !== 1) {
          throw new WorkOrderError('WORK_ORDER_RECURRENCE_VERSION_CONFLICT');
        }
      },
      {
        notFound: () => new WorkOrderError('ORGANIZATION_NOT_FOUND'),
        busy: () => new WorkOrderError('WORK_ORDERS_BUSY'),
      },
    );
  }
}
