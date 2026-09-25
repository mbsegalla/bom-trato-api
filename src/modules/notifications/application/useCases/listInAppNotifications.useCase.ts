import { InAppNotificationError } from '../../domain/errors/inAppNotification.error.js';
import type { InAppNotificationRepository } from '../../domain/repositories/inAppNotification.repository.js';

interface ListInAppNotificationsParams {
  userId: string;
  organizationId: string;
  limit: number;
}

export class ListInAppNotificationsUseCase {
  constructor(private readonly repository: InAppNotificationRepository) {}

  async execute(params: ListInAppNotificationsParams) {
    if (!(await this.repository.isMember(params.userId, params.organizationId))) {
      throw new InAppNotificationError('MEMBER_REQUIRED');
    }

    return this.repository.list(params);
  }
}
