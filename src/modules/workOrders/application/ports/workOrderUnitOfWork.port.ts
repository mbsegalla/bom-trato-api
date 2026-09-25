import type { InAppNotificationRepository } from '../../../notifications/domain/repositories/inAppNotification.repository.js';
import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { QuoteProps } from '../../../quotes/domain/entities/quote.entity.js';
import type { WorkOrderRepository } from '../../domain/repositories/workOrder.repository.js';

import type { WorkOrderScheduleRepository } from './workOrderScheduleRepository.port.js';

export interface WorkOrderActorParams {
  organizationId: string;
  userId: string;
}

export interface WorkOrderReadContext {
  readonly workOrders: Pick<WorkOrderRepository, 'findById' | 'list' | 'listStatusHistory' | 'listScheduleHistory'>;
  readonly access: OrganizationAccessContext;
  readonly schedule: WorkOrderScheduleRepository;
}

export interface WorkOrderTransaction {
  readonly workOrders: WorkOrderRepository;
  readonly access: OrganizationAccessContext;
  readonly schedule: WorkOrderScheduleRepository;
  readonly inAppNotifications: Pick<InAppNotificationRepository, 'enqueue'>;
  findQuote(quoteId: string): Promise<QuoteProps | null>;
  isAssignableMember(userId: string): Promise<boolean>;
}

export abstract class WorkOrderUnitOfWork {
  abstract read<T>(params: WorkOrderActorParams, operation: (context: WorkOrderReadContext) => Promise<T>): Promise<T>;
  abstract run<T>(params: WorkOrderActorParams, operation: (tx: WorkOrderTransaction) => Promise<T>): Promise<T>;
}
