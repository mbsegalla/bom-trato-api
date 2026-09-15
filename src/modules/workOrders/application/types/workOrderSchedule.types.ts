import type { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import type { Page, PageParams } from '../../../../shared/domain/types/page.types.js';

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
