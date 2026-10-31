import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import {
  InAppNotificationType,
  QuoteStatus,
  ReceivableStatus,
  WorkOrderStatus,
} from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PrismaInAppNotificationRepository } from '../repositories/prismaInAppNotification.repository.js';

const HOUR_MS = 60 * 60 * 1000;
const QUOTE_FOLLOW_UP_HOURS = 48;

@Injectable()
export class OperationalReminderWorker {
  private readonly logger = new Logger(OperationalReminderWorker.name);

  constructor(private readonly db: PrismaService) {}

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
        title: true,
        scheduledStartAt: true,
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
        dueAt: true,
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
        dueAt: true,
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
    }
  }
}
