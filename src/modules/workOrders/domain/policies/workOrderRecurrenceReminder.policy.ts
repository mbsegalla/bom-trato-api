const DAY_MS = 86_400_000;
const UPCOMING_DAYS = 3;
const OVERDUE_DAYS = 7;

export type WorkOrderRecurrenceReminderStage = 'UPCOMING' | 'DUE' | 'OVERDUE';

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function workOrderRecurrenceReminderWindow(today: string): { from: Date; to: Date } {
  const start = dateOnly(today).getTime();

  return {
    from: new Date(start - OVERDUE_DAYS * DAY_MS),
    to: new Date(start + UPCOMING_DAYS * DAY_MS),
  };
}

export function resolveWorkOrderRecurrenceReminderStage(
  visitOn: string,
  today: string,
  autoGenerateEnabled: boolean,
): WorkOrderRecurrenceReminderStage | null {
  const days = (dateOnly(visitOn).getTime() - dateOnly(today).getTime()) / DAY_MS;

  if (days >= 1 && days <= UPCOMING_DAYS) {
    return 'UPCOMING';
  }

  if (days === 0) {
    return autoGenerateEnabled ? null : 'DUE';
  }

  if (days < 0 && days >= -OVERDUE_DAYS) {
    return 'OVERDUE';
  }

  return null;
}

export function workOrderRecurrenceReminderKey(
  organizationId: string,
  workOrderId: string,
  userId: string,
  visitOn: string,
  stage: WorkOrderRecurrenceReminderStage,
): string {
  return `recurrence-reminder/${organizationId}/${workOrderId}/${userId}/${visitOn}/${stage}`;
}

export function workOrderRecurringQuoteNotificationKey(organizationId: string, quoteId: string): string {
  return `recurring-quote-created/${organizationId}/${quoteId}`;
}
