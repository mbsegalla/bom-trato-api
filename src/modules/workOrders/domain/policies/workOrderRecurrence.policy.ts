import { WorkOrderError } from '../errors/workOrder.error.js';

export const WORK_ORDER_RECURRENCE_LIMITS = { DAY: 365, WEEK: 52, MONTH: 12 } as const;

export type WorkOrderRecurrenceUnit = keyof typeof WORK_ORDER_RECURRENCE_LIMITS;

export interface WorkOrderRecurrenceSettings {
  intervalUnit: WorkOrderRecurrenceUnit;
  intervalCount: number;
  nextVisitOn: string;
  enabled: boolean;
  version: number;
}

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function workOrderRecurrenceDate(date: Date): string {
  const parts = dateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

function isVisitDate(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2000-01-01') {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export class WorkOrderRecurrencePolicy {
  static configure(
    input: WorkOrderRecurrenceSettings,
    currentVersion: number,
    completedAt: Date,
    now: Date,
  ): WorkOrderRecurrenceSettings {
    if (
      (input.intervalUnit !== 'DAY' && input.intervalUnit !== 'WEEK' && input.intervalUnit !== 'MONTH') ||
      !Number.isSafeInteger(input.intervalCount) ||
      input.intervalCount < 1 ||
      input.intervalCount > WORK_ORDER_RECURRENCE_LIMITS[input.intervalUnit] ||
      typeof input.enabled !== 'boolean' ||
      !isVisitDate(input.nextVisitOn) ||
      input.nextVisitOn < workOrderRecurrenceDate(completedAt) ||
      (input.enabled && input.nextVisitOn < workOrderRecurrenceDate(now))
    ) {
      throw new WorkOrderError('INVALID_WORK_ORDER_RECURRENCE');
    }

    if (
      !Number.isSafeInteger(input.version) ||
      input.version < 0 ||
      input.version !== currentVersion ||
      currentVersion >= 2147483647
    ) {
      throw new WorkOrderError('WORK_ORDER_RECURRENCE_VERSION_CONFLICT');
    }

    return {
      intervalUnit: input.intervalUnit,
      intervalCount: input.intervalCount,
      nextVisitOn: input.nextVisitOn,
      enabled: input.enabled,
      version: currentVersion + 1,
    };
  }
}
