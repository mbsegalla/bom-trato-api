import { QuoteStatus, WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import type { QuoteProps } from '../../../quotes/domain/entities/quote.entity.js';
import { WorkOrderError } from '../errors/workOrder.error.js';
import type { WorkOrderItemProps, WorkOrderProps, WorkOrderScheduleSlot } from '../types/workOrder.types.js';

export interface WorkOrderDetails {
  title?: string;
  instructions?: string | null;
  serviceAddress?: string | null;
}

export class WorkOrder {
  private constructor(private state: WorkOrderProps) {}

  static create(
    params: {
      id: string;
      organizationId: string;
      userId: string;
      quote: QuoteProps;
      itemIds: string[];
    },
    now: Date,
  ): WorkOrder {
    const { quote } = params;

    if (quote.organizationId !== params.organizationId) {
      throw new WorkOrderError('QUOTE_NOT_FOUND');
    }

    if (quote.status !== QuoteStatus.APPROVED) {
      throw new WorkOrderError('QUOTE_NOT_APPROVED');
    }

    if (quote.items.length === 0 || params.itemIds.length !== quote.items.length) {
      throw new WorkOrderError('INVALID_WORK_ORDER_INPUT');
    }

    const items: WorkOrderItemProps[] = quote.items.map((item, position) => ({
      id: params.itemIds[position],
      sourceQuoteItemId: item.id,
      name: item.name,
      description: item.description,
      unit: item.unit,
      quantityInThousandths: item.quantityInThousandths,
      unitAmountInCents: item.unitAmountInCents,
      totalInCents: item.totalInCents,
      position,
    }));

    return new WorkOrder({
      id: params.id,
      organizationId: params.organizationId,
      quoteId: quote.id,
      customerId: quote.customerId,
      customerName: quote.customerName,
      customerEmail: quote.customerEmail,
      customerPhone: quote.customerPhone,
      title: quote.title,
      instructions: quote.notes,
      serviceAddress: null,
      executionNotes: null,
      assignedToId: null,
      status: WorkOrderStatus.OPEN,
      currency: quote.currency,
      subtotalInCents: quote.subtotalInCents,
      discountInCents: quote.discountInCents,
      totalInCents: quote.totalInCents,
      scheduledStartAt: null,
      scheduledEndAt: null,
      startedAt: null,
      completedAt: null,
      canceledAt: null,
      cancellationReason: null,
      version: 1,
      createdById: params.userId,
      updatedById: params.userId,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      items,
    });
  }

  static restore(state: WorkOrderProps): WorkOrder {
    return new WorkOrder(structuredClone(state));
  }

  snapshot(): WorkOrderProps {
    return structuredClone(this.state);
  }

  assertVersion(version: number): void {
    if (!Number.isSafeInteger(version) || version !== this.state.version) {
      throw new WorkOrderError('WORK_ORDER_VERSION_CONFLICT');
    }
  }

  recordChange(userId: string, now: Date): void {
    if (this.state.version >= 2147483647) {
      throw new WorkOrderError('WORK_ORDER_VERSION_CONFLICT');
    }

    this.state.version++;
    this.state.updatedById = userId;
    this.state.updatedAt = new Date(now);
  }

  update(details: WorkOrderDetails): void {
    this.assertPlanning();

    if ([details.title, details.instructions, details.serviceAddress].every((value) => value === undefined)) {
      throw new WorkOrderError('INVALID_WORK_ORDER_INPUT');
    }

    const title = details.title === undefined ? this.state.title : details.title;

    if (typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 150) {
      throw new WorkOrderError('INVALID_WORK_ORDER_INPUT');
    }

    const instructions =
      details.instructions === undefined ? this.state.instructions : this.normalizeText(details.instructions, 5000);

    const address =
      details.serviceAddress === undefined
        ? this.state.serviceAddress
        : this.normalizeText(details.serviceAddress, 500);

    if (this.state.status === WorkOrderStatus.SCHEDULED && address === null) {
      throw new WorkOrderError('SERVICE_ADDRESS_REQUIRED');
    }

    this.state = {
      ...this.state,
      title: title.trim(),
      instructions,
      serviceAddress: address,
    };
  }

  assign(userId: string | null): void {
    this.assertPlanning();

    if (this.state.status === WorkOrderStatus.SCHEDULED && userId === null) {
      throw new WorkOrderError('ASSIGNEE_REQUIRED');
    }

    this.state.assignedToId = userId;
  }

  schedule(start: Date, end: Date, now: Date): void {
    this.assertPlanning();
    this.assertReady();

    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start <= now || end <= start) {
      throw new WorkOrderError('INVALID_WORK_ORDER_SCHEDULE');
    }

    this.state.scheduledStartAt = new Date(start);
    this.state.scheduledEndAt = new Date(end);
    this.state.status = WorkOrderStatus.SCHEDULED;
  }

  start(now: Date): void {
    this.assertPlanning();
    this.assertReady();

    this.state.status = WorkOrderStatus.IN_PROGRESS;
    this.state.startedAt = new Date(now);
  }

  updateExecutionNotes(notes: string | null): void {
    if (this.state.status === WorkOrderStatus.COMPLETED || this.state.status === WorkOrderStatus.CANCELED) {
      throw new WorkOrderError('WORK_ORDER_NOT_EDITABLE');
    }

    this.state.executionNotes = this.normalizeText(notes, 10000);
  }

  complete(now: Date): void {
    if (this.state.status !== WorkOrderStatus.IN_PROGRESS) {
      throw new WorkOrderError('INVALID_WORK_ORDER_TRANSITION');
    }

    this.state.status = WorkOrderStatus.COMPLETED;
    this.state.completedAt = new Date(now);
  }

  cancel(reason: string, now: Date): void {
    if (this.state.status === WorkOrderStatus.COMPLETED || this.state.status === WorkOrderStatus.CANCELED) {
      throw new WorkOrderError('INVALID_WORK_ORDER_TRANSITION');
    }

    if (typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 1000) {
      throw new WorkOrderError('CANCELLATION_REASON_REQUIRED');
    }

    this.state.status = WorkOrderStatus.CANCELED;
    this.state.canceledAt = new Date(now);
    this.state.cancellationReason = reason.trim();
  }

  scheduleToCheck(previous: WorkOrderProps): WorkOrderScheduleSlot | null {
    const current = this.state;

    if (current.status !== WorkOrderStatus.SCHEDULED) {
      return null;
    }

    if (
      previous.status === current.status &&
      previous.assignedToId === current.assignedToId &&
      previous.scheduledStartAt?.getTime() === current.scheduledStartAt?.getTime() &&
      previous.scheduledEndAt?.getTime() === current.scheduledEndAt?.getTime()
    ) {
      return null;
    }

    if (current.assignedToId === null) {
      throw new WorkOrderError('ASSIGNEE_REQUIRED');
    }

    if (current.scheduledStartAt === null || current.scheduledEndAt === null) {
      throw new WorkOrderError('INVALID_WORK_ORDER_SCHEDULE');
    }

    return {
      workOrderId: current.id,
      assignedToId: current.assignedToId,
      start: new Date(current.scheduledStartAt),
      end: new Date(current.scheduledEndAt),
    };
  }

  private assertPlanning(): void {
    if (this.state.status !== WorkOrderStatus.OPEN && this.state.status !== WorkOrderStatus.SCHEDULED) {
      throw new WorkOrderError('WORK_ORDER_NOT_EDITABLE');
    }
  }

  private assertReady(): void {
    if (this.state.assignedToId === null) {
      throw new WorkOrderError('ASSIGNEE_REQUIRED');
    }

    if (this.state.serviceAddress === null) {
      throw new WorkOrderError('SERVICE_ADDRESS_REQUIRED');
    }
  }

  private normalizeText(value: string | null, maxLength: number): string | null {
    if (value === null) {
      return null;
    }

    if (typeof value !== 'string' || value.trim().length > maxLength) {
      throw new WorkOrderError('INVALID_WORK_ORDER_INPUT');
    }

    return value.trim() || null;
  }
}
