import { describe, expect, it } from 'vitest';

import { workOrderRecurrenceDate } from './workOrderRecurrence.policy.js';
import {
  resolveWorkOrderRecurrenceReminderStage,
  workOrderRecurrenceReminderKey,
  workOrderRecurrenceReminderWindow,
  workOrderRecurringQuoteNotificationKey,
} from './workOrderRecurrenceReminder.policy.js';

describe('recurring service reminder policy', () => {
  const today = '2026-12-30';

  it.each([
    ['2026-12-22', false, null],
    ['2026-12-23', false, 'OVERDUE'],
    ['2026-12-29', true, 'OVERDUE'],
    ['2026-12-30', false, 'DUE'],
    ['2026-12-30', true, null],
    ['2026-12-31', false, 'UPCOMING'],
    ['2027-01-02', true, 'UPCOMING'],
    ['2027-01-03', false, null],
  ] as const)('classifies visit %s with automatic generation %s as %s', (visitOn, automatic, expected) => {
    expect(resolveWorkOrderRecurrenceReminderStage(visitOn, today, automatic)).toBe(expected);
  });

  it('uses a bounded date-only window across the year boundary', () => {
    expect(workOrderRecurrenceReminderWindow(today)).toEqual({
      from: new Date('2026-12-23T00:00:00.000Z'),
      to: new Date('2027-01-02T00:00:00.000Z'),
    });
  });

  it('uses the Sao Paulo business date around midnight UTC', () => {
    const businessDay = workOrderRecurrenceDate(new Date('2026-12-31T02:59:59.000Z'));

    expect(resolveWorkOrderRecurrenceReminderStage(today, businessDay, false)).toBe('DUE');
    expect(resolveWorkOrderRecurrenceReminderStage('2028-02-29', '2028-02-27', false)).toBe('UPCOMING');
  });

  it('deduplicates the same recipient, source, date and stage while separating other occurrences', () => {
    const key = workOrderRecurrenceReminderKey('org', 'order', 'owner', today, 'DUE');

    expect(workOrderRecurrenceReminderKey('org', 'order', 'owner', today, 'DUE')).toBe(key);
    expect(workOrderRecurrenceReminderKey('org', 'order', 'other-owner', today, 'DUE')).not.toBe(key);
    expect(workOrderRecurrenceReminderKey('org', 'order', 'owner', '2026-12-31', 'DUE')).not.toBe(key);
    expect(workOrderRecurrenceReminderKey('org', 'order', 'owner', today, 'OVERDUE')).not.toBe(key);
    expect(workOrderRecurringQuoteNotificationKey('org', 'quote')).not.toBe(key);
  });
});
