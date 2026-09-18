import type { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import type { Page, PageParams } from '../../../../shared/types/page.types.js';
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

export interface WorkOrderScheduleListInput extends PageParams {
  from: string;
  to: string;
  assignedToId?: string;
  status?: WorkOrderStatus;
  late?: boolean;
}

export interface WorkOrderScheduleQuery extends PageParams {
  from: Date;
  to: Date;
  now: Date;
  assignedToId?: string;
  status?: WorkOrderStatus;
  late?: boolean;
}

export interface WorkOrderScheduleItem {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  serviceAddress: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  status: WorkOrderStatus;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  startedAt: Date | null;
  version: number;
  late: boolean;
}

export interface WorkOrderScheduleView extends Page<WorkOrderScheduleItem> {
  generatedAt: Date;
  from: Date;
  to: Date;
}
