import { randomUUID } from 'node:crypto';

import type { Prisma } from '../../../../generated/prisma/client.js';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { InAppNotification } from '../../domain/entities/inAppNotification.entity.js';
import type {
  InAppNotificationList,
  ListInAppNotificationsParams,
  MarkAllInAppNotificationsParams,
  MarkInAppNotificationParams,
} from '../../domain/repositories/inAppNotification.repository.js';
import { InAppNotificationRepository } from '../../domain/repositories/inAppNotification.repository.js';
import { IN_APP_NOTIFICATION_CHANNEL } from '../realtime/notificationRealtime.constants.js';

type NotificationDatabase = PrismaService | Prisma.TransactionClient;

export class PrismaInAppNotificationRepository extends InAppNotificationRepository {
  constructor(private readonly db: NotificationDatabase) {
    super();
  }

  async enqueue(input: Parameters<InAppNotificationRepository['enqueue']>[0]): Promise<void> {
    const notification = InAppNotification.create({
      ...input,
      id: randomUUID(),
      createdAt: new Date(),
    });

    const state = notification.snapshot();

    const result = await this.db.inAppNotification.createMany({
      data: [state],
      skipDuplicates: true,
    });

    if (result.count === 0) {
      return;
    }

    const payload = JSON.stringify({
      userId: state.userId,
      organizationId: state.organizationId,
    });

    await this.db.$executeRaw`
      SELECT pg_notify(${IN_APP_NOTIFICATION_CHANNEL}, ${payload})
    `;
  }

  async list(params: ListInAppNotificationsParams): Promise<InAppNotificationList> {
    const { userId, organizationId, limit } = params;

    const [items, unreadCount] = await Promise.all([
      this.db.inAppNotification.findMany({
        where: {
          userId,
          organizationId,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      }),
      this.db.inAppNotification.count({
        where: {
          userId,
          organizationId,
          readAt: null,
        },
      }),
    ]);

    return {
      items,
      unreadCount,
    };
  }

  async markRead(params: MarkInAppNotificationParams): Promise<boolean> {
    const { id, now, organizationId, userId } = params;

    const result = await this.db.inAppNotification.updateMany({
      where: {
        id,
        userId,
        organizationId,
      },
      data: {
        readAt: now,
      },
    });

    return result.count === 1;
  }

  async markAllRead(params: MarkAllInAppNotificationsParams): Promise<void> {
    const { now, organizationId, userId } = params;

    await this.db.inAppNotification.updateMany({
      where: {
        userId,
        organizationId,
        readAt: null,
      },
      data: {
        readAt: now,
      },
    });
  }

  async isMember(userId: string, organizationId: string): Promise<boolean> {
    const member = await this.db.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      select: {
        id: true,
      },
    });

    return member !== null;
  }
}
