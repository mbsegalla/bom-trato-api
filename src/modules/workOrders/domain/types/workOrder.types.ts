import type { ServiceUnit, WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import type { Page, PageParams } from '../../../../shared/types/page.types.js';

export interface WorkOrderItemProps {
  id: string;
  sourceQuoteItemId: string;
  name: string;
  description: string | null;
  unit: ServiceUnit;
  quantityInThousandths: number;
  unitAmountInCents: number;
  totalInCents: number;
  position: number;
}

export interface WorkOrderProps {
  id: string;
  organizationId: string;
  quoteId: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  title: string;
  instructions: string | null;
  serviceAddress: string | null;
  executionNotes: string | null;
  assignedToId: string | null;
  status: WorkOrderStatus;
  currency: string;
  subtotalInCents: number;
  discountInCents: number;
  totalInCents: number;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
  cancellationReason: string | null;
  version: number;
  createdById: string;
  updatedById: string;
  createdAt: Date;
  updatedAt: Date;
  items: WorkOrderItemProps[];
}

export interface WorkOrderStatusHistoryProps {
  id: string;
  workOrderId: string;
  fromStatus: WorkOrderStatus | null;
  toStatus: WorkOrderStatus;
  actorId: string;
  version: number;
  reason: string | null;
  createdAt: Date;
}

export interface WorkOrderPageParams extends PageParams {
  status?: WorkOrderStatus;
  customerId?: string;
  assignedToId?: string;
  scheduledFrom?: Date;
  scheduledTo?: Date;
}

export type WorkOrderPage<T> = Page<T>;
