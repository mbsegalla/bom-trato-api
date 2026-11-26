import { WorkOrderError } from '../errors/workOrder.error.js';

import { WORK_ORDER_RECURRENCE_LIMITS, type WorkOrderRecurrenceUnit } from './workOrderRecurrence.policy.js';

const DAY_MS = 86_400_000;

function calendarDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < '2000-01-01' ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new WorkOrderError('INVALID_WORK_ORDER_RECURRENCE');
  }

  return date;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months + 1, 0);
  result.setUTCDate(Math.min(day, result.getUTCDate()));

  return result;
}

export function nextWorkOrderRecurrenceVisit(
  visitOn: string,
  today: string,
  unit: WorkOrderRecurrenceUnit,
  count: number,
): string {
  const visit = calendarDate(visitOn);
  const current = calendarDate(today);

  if (
    !Number.isInteger(count) ||
    !(unit === 'DAY' || unit === 'WEEK' || unit === 'MONTH') ||
    count < 1 ||
    count > WORK_ORDER_RECURRENCE_LIMITS[unit] ||
    visit > current
  ) {
    throw new WorkOrderError('INVALID_WORK_ORDER_RECURRENCE');
  }

  let next: Date;

  if (unit === 'MONTH') {
    const months = (current.getUTCFullYear() - visit.getUTCFullYear()) * 12 + current.getUTCMonth() - visit.getUTCMonth();
    let periods = Math.max(1, Math.floor(months / count));

    next = addMonths(visit, periods * count);

    if (next <= current) {
      periods++;
      next = addMonths(visit, periods * count);
    }
  } else {
    const interval = count * (unit === 'WEEK' ? 7 : 1) * DAY_MS;
    const periods = Math.floor((current.getTime() - visit.getTime()) / interval) + 1;

    next = new Date(visit.getTime() + periods * interval);
  }

  if (!Number.isFinite(next.getTime()) || next.getUTCFullYear() > 9999 || next <= current) {
    throw new WorkOrderError('INVALID_WORK_ORDER_RECURRENCE');
  }

  return next.toISOString().slice(0, 10);
}
