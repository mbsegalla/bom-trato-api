import type { WorkOrderStatus } from '../../../../generated/prisma/enums.js';

export interface WorkOrderScheduleSlot {
  workOrderId: string;
  assignedToId: string;
  start: Date;
  end: Date;
}

export interface WorkOrderScheduleHistoryProps {
  id: string;
  workOrderId: string;
  fromAssignedToId: string | null;
  toAssignedToId: string | null;
  fromStartAt: Date | null;
  fromEndAt: Date | null;
  toStartAt: Date | null;
  toEndAt: Date | null;
  fromStatus: WorkOrderStatus;
  toStatus: WorkOrderStatus;
  actorId: string;
  version: number;
  createdAt: Date;
}
