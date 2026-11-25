import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import type { WorkOrderScheduleHistoryProps, WorkOrderStatusHistoryProps } from '../types/workOrder.types.js';

export const PublicWorkOrderTimelineEventType = {
  QuoteApproved: 'QUOTE_APPROVED',
  WorkOrderCreated: 'WORK_ORDER_CREATED',
  WorkOrderScheduled: 'WORK_ORDER_SCHEDULED',
  WorkOrderRescheduled: 'WORK_ORDER_RESCHEDULED',
  WorkOrderStarted: 'WORK_ORDER_STARTED',
  WorkOrderCompleted: 'WORK_ORDER_COMPLETED',
  WorkOrderCanceled: 'WORK_ORDER_CANCELED',
} as const;

export type PublicWorkOrderTimelineEventType =
  (typeof PublicWorkOrderTimelineEventType)[keyof typeof PublicWorkOrderTimelineEventType];

export interface PublicWorkOrderTimelineEvent {
  type: PublicWorkOrderTimelineEventType;
  occurredAt: Date;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
}

export type PublicWorkOrderStatusHistory = Pick<
  WorkOrderStatusHistoryProps,
  'fromStatus' | 'toStatus' | 'version' | 'createdAt'
>;

export type PublicWorkOrderScheduleHistory = Pick<
  WorkOrderScheduleHistoryProps,
  'fromStatus' | 'toStatus' | 'fromStartAt' | 'fromEndAt' | 'toStartAt' | 'toEndAt' | 'version' | 'createdAt'
>;

export interface PublicWorkOrderTimelineSource {
  quoteApprovedAt: Date | null;
  statusHistory: PublicWorkOrderStatusHistory[];
  scheduleHistory: PublicWorkOrderScheduleHistory[];
}

interface PublicWorkOrderTimelineContext extends PublicWorkOrderTimelineSource {
  createdAt: Date;
}

interface OrderedTimelineEvent {
  event: PublicWorkOrderTimelineEvent;
  sequence: number;
}

const statusEvents: Record<WorkOrderStatus, PublicWorkOrderTimelineEventType | null> = {
  [WorkOrderStatus.OPEN]: null,
  [WorkOrderStatus.SCHEDULED]: PublicWorkOrderTimelineEventType.WorkOrderScheduled,
  [WorkOrderStatus.IN_PROGRESS]: PublicWorkOrderTimelineEventType.WorkOrderStarted,
  [WorkOrderStatus.COMPLETED]: PublicWorkOrderTimelineEventType.WorkOrderCompleted,
  [WorkOrderStatus.CANCELED]: PublicWorkOrderTimelineEventType.WorkOrderCanceled,
};

export class PublicWorkOrderTimelinePolicy {
  static resolve(context: PublicWorkOrderTimelineContext, now: Date): PublicWorkOrderTimelineEvent[] {
    const events = [
      ...this.resolveInitialEvents(context),
      ...this.resolveStatusEvents(context),
      ...this.resolveScheduleEvents(context.scheduleHistory),
    ];

    return events
      .filter(({ event }) => this.hasOccurred(event.occurredAt, now))
      .sort(
        (left, right) =>
          left.event.occurredAt.getTime() - right.event.occurredAt.getTime() || left.sequence - right.sequence,
      )
      .map(({ event }) => event);
  }

  private static resolveInitialEvents(context: PublicWorkOrderTimelineContext): OrderedTimelineEvent[] {
    const { quoteApprovedAt, createdAt } = context;

    const events: OrderedTimelineEvent[] = [
      this.createEvent(PublicWorkOrderTimelineEventType.WorkOrderCreated, createdAt, 0),
    ];

    if (quoteApprovedAt !== null && quoteApprovedAt <= createdAt) {
      events.push(this.createEvent(PublicWorkOrderTimelineEventType.QuoteApproved, quoteApprovedAt, -1));
    }

    return events;
  }

  private static resolveStatusEvents(context: PublicWorkOrderTimelineContext): OrderedTimelineEvent[] {
    const schedulesByVersion = new Map(context.scheduleHistory.map((history) => [history.version, history]));

    return context.statusHistory.flatMap((history) => {
      const type = statusEvents[history.toStatus];

      if (type === null || history.fromStatus === history.toStatus) {
        return [];
      }

      const schedule =
        history.toStatus === WorkOrderStatus.SCHEDULED ? schedulesByVersion.get(history.version) : undefined;

      return [this.createEvent(type, history.createdAt, history.version, schedule)];
    });
  }

  private static resolveScheduleEvents(history: PublicWorkOrderScheduleHistory[]): OrderedTimelineEvent[] {
    return history
      .filter((entry) => this.isReschedule(entry))
      .map((entry) =>
        this.createEvent(PublicWorkOrderTimelineEventType.WorkOrderRescheduled, entry.createdAt, entry.version, entry),
      );
  }

  private static isReschedule(history: PublicWorkOrderScheduleHistory): boolean {
    return (
      history.fromStatus === WorkOrderStatus.SCHEDULED &&
      history.toStatus === WorkOrderStatus.SCHEDULED &&
      this.hasValidSchedule(history) &&
      this.hasScheduleChanged(history)
    );
  }

  private static hasScheduleChanged(history: PublicWorkOrderScheduleHistory): boolean {
    return (
      history.fromStartAt?.getTime() !== history.toStartAt?.getTime() ||
      history.fromEndAt?.getTime() !== history.toEndAt?.getTime()
    );
  }

  private static hasValidSchedule(history: PublicWorkOrderScheduleHistory): boolean {
    const { toStartAt, toEndAt } = history;

    return (
      toStartAt !== null &&
      toEndAt !== null &&
      Number.isFinite(toStartAt.getTime()) &&
      Number.isFinite(toEndAt.getTime()) &&
      toEndAt > toStartAt
    );
  }

  private static hasOccurred(occurredAt: Date, now: Date): boolean {
    return Number.isFinite(occurredAt.getTime()) && occurredAt <= now;
  }

  private static createEvent(
    type: PublicWorkOrderTimelineEventType,
    occurredAt: Date,
    sequence: number,
    schedule?: PublicWorkOrderScheduleHistory,
  ): OrderedTimelineEvent {
    const validSchedule = schedule !== undefined && this.hasValidSchedule(schedule) ? schedule : null;

    return {
      sequence,
      event: {
        type,
        occurredAt,
        scheduledStartAt: validSchedule?.toStartAt ?? null,
        scheduledEndAt: validSchedule?.toEndAt ?? null,
      },
    };
  }
}
