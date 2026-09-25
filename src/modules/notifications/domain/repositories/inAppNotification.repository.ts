import type { CreateInAppNotificationParams, InAppNotificationProps } from '../entities/inAppNotification.entity.js';

export interface ListInAppNotificationsParams {
  userId: string;
  organizationId: string;
  limit: number;
}

export interface MarkInAppNotificationParams {
  id: string;
  userId: string;
  organizationId: string;
  now: Date;
}

export interface MarkAllInAppNotificationsParams {
  userId: string;
  organizationId: string;
  now: Date;
}

export interface InAppNotificationList {
  items: InAppNotificationProps[];
  unreadCount: number;
}

export abstract class InAppNotificationRepository {
  abstract enqueue(input: Omit<CreateInAppNotificationParams, 'id' | 'createdAt'>): Promise<void>;
  abstract list(params: ListInAppNotificationsParams): Promise<InAppNotificationList>;
  abstract markRead(params: MarkInAppNotificationParams): Promise<boolean>;
  abstract markAllRead(params: MarkAllInAppNotificationsParams): Promise<void>;
  abstract isMember(userId: string, organizationId: string): Promise<boolean>;
}
