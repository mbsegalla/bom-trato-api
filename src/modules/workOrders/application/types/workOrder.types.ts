import type { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import type { WorkOrderActorParams } from '../ports/workOrderUnitOfWork.port.js';

export interface WorkOrderByIdParams extends WorkOrderActorParams {
  workOrderId: string;
}

export interface ChangeWorkOrderParams extends WorkOrderByIdParams {
  version: number;
}

export interface WorkOrderScheduleInput {
  scheduledStartAt: string;
  scheduledEndAt: string;
}

export interface WorkOrderPageInput {
  page: number;
  limit: number;
  status?: WorkOrderStatus;
  customerId?: string;
  assignedToId?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
}
