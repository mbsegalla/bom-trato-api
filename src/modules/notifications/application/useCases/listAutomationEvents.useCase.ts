import { InAppNotificationError } from '../../domain/errors/inAppNotification.error.js';
import type { AutomationEventRepository } from '../../domain/repositories/automationEvent.repository.js';

interface ListAutomationEventsUseCaseParams {
  userId: string;
  organizationId: string;
  limit: number;
}

export class ListAutomationEventsUseCase {
  constructor(private readonly repository: AutomationEventRepository) {}

  async execute(params: ListAutomationEventsUseCaseParams) {
    const { userId, organizationId, limit } = params;

    if (!(await this.repository.isMember(userId, organizationId))) {
      throw new InAppNotificationError('MEMBER_REQUIRED');
    }

    return {
      items: await this.repository.list(organizationId, limit),
    };
  }
}
