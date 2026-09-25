import { InAppNotificationError } from '../../domain/errors/inAppNotification.error.js';
import type { InAppNotificationRepository } from '../../domain/repositories/inAppNotification.repository.js';

interface MarkAllInAppNotificationsReadParams {
  userId: string;
  organizationId: string;
}

export class MarkAllInAppNotificationsReadUseCase {
  constructor(private readonly repository: InAppNotificationRepository) {}

  async execute(params: MarkAllInAppNotificationsReadParams): Promise<void> {
    if (!(await this.repository.isMember(params.userId, params.organizationId))) {
      throw new InAppNotificationError('MEMBER_REQUIRED');
    }

    await this.repository.markAllRead({
      ...params,
      now: new Date(),
    });
  }
}
