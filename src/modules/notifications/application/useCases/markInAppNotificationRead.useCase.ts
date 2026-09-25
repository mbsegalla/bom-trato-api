import { InAppNotificationError } from '../../domain/errors/inAppNotification.error.js';
import type { InAppNotificationRepository } from '../../domain/repositories/inAppNotification.repository.js';

interface MarkInAppNotificationReadParams {
  id: string;
  userId: string;
  organizationId: string;
}

export class MarkInAppNotificationReadUseCase {
  constructor(private readonly repository: InAppNotificationRepository) {}

  async execute(params: MarkInAppNotificationReadParams): Promise<void> {
    if (!(await this.repository.isMember(params.userId, params.organizationId))) {
      throw new InAppNotificationError('MEMBER_REQUIRED');
    }

    const updated = await this.repository.markRead({
      ...params,
      now: new Date(),
    });

    if (!updated) {
      throw new InAppNotificationError('NOTIFICATION_NOT_FOUND');
    }
  }
}
