import type { AutomationEntityType, AutomationType, NotificationStatus } from '../../../../generated/prisma/enums.js';

export interface AutomationEventProps {
  id: string;
  type: AutomationType;
  entityType: AutomationEntityType;
  entityId: string;
  description: string;
  href: string;
  status: NotificationStatus;
  availableAt: Date;
  createdAt: Date;
  finishedAt: Date | null;
  lastErrorCode: string | null;
}

export abstract class AutomationEventRepository {
  abstract isMember(userId: string, organizationId: string): Promise<boolean>;
  abstract list(organizationId: string, limit: number): Promise<AutomationEventProps[]>;
}
