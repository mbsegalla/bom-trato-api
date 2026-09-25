import type { InAppNotificationType } from '../../../../generated/prisma/enums.js';
import { InAppNotificationError } from '../errors/inAppNotification.error.js';

export interface InAppNotificationProps {
  id: string;
  key: string;
  userId: string;
  organizationId: string;
  type: InAppNotificationType;
  title: string;
  message: string;
  href: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface CreateInAppNotificationParams {
  id: string;
  key: string;
  userId: string;
  organizationId: string;
  type: InAppNotificationType;
  title: string;
  message: string;
  href: string;
  createdAt: Date;
}

export class InAppNotification {
  private constructor(private props: InAppNotificationProps) {}

  static create(params: CreateInAppNotificationParams): InAppNotification {
    const key = params.key.trim();
    const title = params.title.trim();
    const message = params.message.trim();
    const href = params.href.trim();

    if (
      key.length === 0 ||
      key.length > 200 ||
      title.length === 0 ||
      title.length > 150 ||
      message.length === 0 ||
      message.length > 500 ||
      href.length === 0 ||
      href.length > 500 ||
      !href.startsWith('/') ||
      href.startsWith('//')
    ) {
      throw new InAppNotificationError('INVALID_NOTIFICATION');
    }

    return new InAppNotification({
      id: params.id,
      key,
      userId: params.userId,
      organizationId: params.organizationId,
      type: params.type,
      title,
      message,
      href,
      readAt: null,
      createdAt: new Date(params.createdAt),
    });
  }

  static restore(props: InAppNotificationProps): InAppNotification {
    return new InAppNotification(structuredClone(props));
  }

  markRead(now: Date): void {
    if (this.props.readAt === null) {
      this.props.readAt = new Date(now);
    }
  }

  snapshot(): InAppNotificationProps {
    return structuredClone(this.props);
  }
}
