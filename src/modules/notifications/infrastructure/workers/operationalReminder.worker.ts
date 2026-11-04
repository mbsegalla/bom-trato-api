import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import {
  AutomationEntityType,
  AutomationType,
  InAppNotificationType,
  QuoteStatus,
  ReceivableStatus,
  WorkOrderStatus,
} from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { NotificationOutbox } from '../../application/ports/notificationOutbox.port.js';
import { PrismaInAppNotificationRepository } from '../repositories/prismaInAppNotification.repository.js';

const HOUR_MS = 60 * 60 * 1000;
const QUOTE_FOLLOW_UP_HOURS = 48;

@Injectable()
export class OperationalReminderWorker {
  private readonly logger = new Logger(OperationalReminderWorker.name);

  constructor(
    private readonly db: PrismaService,
    private readonly outbox: NotificationOutbox,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'operational-reminders',
    timeZone: 'UTC',
    waitForCompletion: true,
  })
  async run(): Promise<void> {
    const now = new Date();

    try {
      await this.quoteFollowUps(now);
      await this.workOrderReminders(now);
      await this.receivableDueSoon(now);
      await this.receivableOverdue(now);
    } catch (error: unknown) {
      this.logger.error('Operational reminders failed', error instanceof Error ? error.stack : undefined);
    }
  }

  private async quoteFollowUps(now: Date): Promise<void> {
    const threshold = new Date(now.getTime() - QUOTE_FOLLOW_UP_HOURS * HOUR_MS);

    const quotes = await this.db.quote.findMany({
      where: {
        status: QuoteStatus.SENT,
        sentAt: {
          lte: threshold,
        },
        OR: [
          {
            validUntil: null,
          },
          {
            validUntil: {
              gt: now,
            },
          },
        ],
      },
      select: {
        id: true,
        organizationId: true,
        customerName: true,
        title: true,
        organization: {
          select: {
            ownerId: true,
          },
        },
      },
      orderBy: {
        id: 'asc',
      },
      take: 500,
    });

    const notifications = new PrismaInAppNotificationRepository(this.db);

    for (const quote of quotes) {
      await notifications.enqueue({
        key: `quote-follow-up/${quote.id}`,
        userId: quote.organization.ownerId,
        organizationId: quote.organizationId,
        type: InAppNotificationType.QUOTE_FOLLOW_UP,
        title: 'Orçamento aguardando resposta',
        message: `${quote.customerName} ainda não respondeu ao orçamento "${quote.title}".`,
        href: `/quotes/${quote.id}`,
      });
    }
  }

  private async workOrderReminders(now: Date): Promise<void> {
    const until = new Date(now.getTime() + 24 * HOUR_MS);

    const orders = await this.db.workOrder.findMany({
      where: {
        status: WorkOrderStatus.SCHEDULED,
        assignedToId: {
          not: null,
        },
        scheduledStartAt: {
          gt: now,
          lte: until,
        },
      },
      select: {
        id: true,
        organizationId: true,
        assignedToId: true,
        customerName: true,
        customerEmail: true,
        title: true,
        scheduledStartAt: true,
        organization: {
          select: {
            name: true,
            autoWorkOrderReminderEnabled: true,
          },
        },
      },
      orderBy: {
        id: 'asc',
      },
      take: 500,
    });

    const notifications = new PrismaInAppNotificationRepository(this.db);

    for (const order of orders) {
      if (order.assignedToId === null || order.scheduledStartAt === null) {
        continue;
      }

      await notifications.enqueue({
        key: `work-order-reminder/${order.id}/${order.scheduledStartAt.toISOString()}`,
        userId: order.assignedToId,
        organizationId: order.organizationId,
        type: InAppNotificationType.WORK_ORDER_REMINDER,
        title: 'Serviço agendado nas próximas 24 horas',
        message: `A ordem "${order.title}" de ${order.customerName} está próxima.`,
        href: `/work-orders/${order.id}`,
      });

      if (!order.organization.autoWorkOrderReminderEnabled || order.customerEmail === null) {
        continue;
      }

      await this.outbox.enqueue({
        key: `automation/work-order-reminder/${order.id}/${order.scheduledStartAt.toISOString()}`,
        recipient: order.customerEmail,
        content: {
          type: 'WORK_ORDER_REMINDER',
          customerName: order.customerName,
          organizationName: order.organization.name,
          workOrderTitle: order.title,
          scheduledStartAt: order.scheduledStartAt.toISOString(),
        },
        expiresAt: order.scheduledStartAt,
        automation: {
          organizationId: order.organizationId,
          type: AutomationType.WORK_ORDER_REMINDER,
          entityType: AutomationEntityType.WORK_ORDER,
          entityId: order.id,
          referenceAt: order.scheduledStartAt,
          description: 'Lembrete automático de serviço agendado',
          href: `/work-orders/${order.id}`,
        },
      });
    }
  }

  private async receivableDueSoon(now: Date): Promise<void> {
    const until = new Date(now.getTime() + 24 * HOUR_MS);

    const receivables = await this.db.receivable.findMany({
      where: {
        status: {
          in: [ReceivableStatus.OPEN, ReceivableStatus.PARTIALLY_PAID],
        },
        dueAt: {
          gt: now,
          lte: until,
        },
      },
      select: {
        id: true,
        organizationId: true,
        customerName: true,
        title: true,
        amountInCents: true,
        receivedInCents: true,
        dueAt: true,
        customer: {
          select: {
            email: true,
          },
        },
        organization: {
          select: {
            ownerId: true,
            name: true,
            autoReceivableReminderEnabled: true,
          },
        },
      },
      orderBy: {
        id: 'asc',
      },
      take: 500,
    });

    const notifications = new PrismaInAppNotificationRepository(this.db);

    for (const receivable of receivables) {
      await notifications.enqueue({
        key: `receivable-due-soon/${receivable.id}/${receivable.dueAt.toISOString()}`,
        userId: receivable.organization.ownerId,
        organizationId: receivable.organizationId,
        type: InAppNotificationType.RECEIVABLE_DUE_SOON,
        title: 'Recebimento próximo do vencimento',
        message: `O recebível de ${receivable.customerName} referente a "${receivable.title}" vence nas próximas 24 horas.`,
        href: `/receivables/${receivable.id}`,
      });

      if (!receivable.organization.autoReceivableReminderEnabled || receivable.customer.email === null) {
        continue;
      }

      await this.outbox.enqueue({
        key: `automation/receivable-due-soon/${receivable.id}/${receivable.dueAt.toISOString()}`,
        recipient: receivable.customer.email,
        content: {
          type: 'RECEIVABLE_DUE_SOON',
          customerName: receivable.customerName,
          organizationName: receivable.organization.name,
          receivableTitle: receivable.title,
          amountDueInCents: receivable.amountInCents - receivable.receivedInCents,
          dueAt: receivable.dueAt.toISOString(),
        },
        expiresAt: receivable.dueAt,
        automation: {
          organizationId: receivable.organizationId,
          type: AutomationType.RECEIVABLE_DUE_SOON,
          entityType: AutomationEntityType.RECEIVABLE,
          entityId: receivable.id,
          referenceAt: receivable.dueAt,
          description: 'Lembrete automático de vencimento',
          href: `/receivables/${receivable.id}`,
        },
      });
    }
  }

  private async receivableOverdue(now: Date): Promise<void> {
    const receivables = await this.db.receivable.findMany({
      where: {
        status: {
          in: [ReceivableStatus.OPEN, ReceivableStatus.PARTIALLY_PAID],
        },
        dueAt: {
          lt: now,
        },
      },
      select: {
        id: true,
        organizationId: true,
        customerName: true,
        title: true,
        amountInCents: true,
        receivedInCents: true,
        dueAt: true,
        customer: {
          select: {
            email: true,
          },
        },
        organization: {
          select: {
            ownerId: true,
            name: true,
            autoReceivableReminderEnabled: true,
          },
        },
      },
      orderBy: {
        id: 'asc',
      },
      take: 500,
    });

    const notifications = new PrismaInAppNotificationRepository(this.db);

    for (const receivable of receivables) {
      await notifications.enqueue({
        key: `receivable-overdue/${receivable.id}/${receivable.dueAt.toISOString()}`,
        userId: receivable.organization.ownerId,
        organizationId: receivable.organizationId,
        type: InAppNotificationType.RECEIVABLE_OVERDUE,
        title: 'Recebimento vencido',
        message: `O recebível de ${receivable.customerName} referente a "${receivable.title}" está vencido.`,
        href: `/receivables/${receivable.id}`,
      });

      if (!receivable.organization.autoReceivableReminderEnabled || receivable.customer.email === null) {
        continue;
      }

      await this.outbox.enqueue({
        key: `automation/receivable-overdue/${receivable.id}/${receivable.dueAt.toISOString()}`,
        recipient: receivable.customer.email,
        content: {
          type: 'RECEIVABLE_OVERDUE',
          customerName: receivable.customerName,
          organizationName: receivable.organization.name,
          receivableTitle: receivable.title,
          amountDueInCents: receivable.amountInCents - receivable.receivedInCents,
          dueAt: receivable.dueAt.toISOString(),
        },
        expiresAt: new Date(now.getTime() + 24 * HOUR_MS),
        automation: {
          organizationId: receivable.organizationId,
          type: AutomationType.RECEIVABLE_OVERDUE,
          entityType: AutomationEntityType.RECEIVABLE,
          entityId: receivable.id,
          referenceAt: receivable.dueAt,
          description: 'Cobrança automática de recebível vencido',
          href: `/receivables/${receivable.id}`,
        },
      });
    }
  }
}
