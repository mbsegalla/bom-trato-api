import { describe, expect, it } from 'vitest';

import { nextWorkOrderRecurrenceVisit } from './workOrderRecurrenceGeneration.policy.js';

describe('recurring service generation calendar', () => {
  it('advances a daily service after today', () => {
    expect(nextWorkOrderRecurrenceVisit('2026-11-25', '2026-11-25', 'DAY', 1)).toBe('2026-11-26');
  });

  it('skips missed daily occurrences without a backlog', () => {
    expect(nextWorkOrderRecurrenceVisit('2026-11-01', '2026-11-25', 'DAY', 3)).toBe('2026-11-28');
  });

  it('keeps weekly intervals across a year boundary', () => {
    expect(nextWorkOrderRecurrenceVisit('2026-12-20', '2026-12-31', 'WEEK', 2)).toBe('2027-01-03');
  });

  it('clamps monthly visits to the last valid day', () => {
    expect(nextWorkOrderRecurrenceVisit('2027-01-31', '2027-01-31', 'MONTH', 1)).toBe('2027-02-28');
    expect(nextWorkOrderRecurrenceVisit('2028-01-31', '2028-01-31', 'MONTH', 1)).toBe('2028-02-29');
  });

  it('keeps the due date as the anchor when catching up', () => {
    expect(nextWorkOrderRecurrenceVisit('2026-01-31', '2026-04-30', 'MONTH', 1)).toBe('2026-05-31');
    expect(nextWorkOrderRecurrenceVisit('2026-01-31', '2026-03-01', 'MONTH', 2)).toBe('2026-03-31');
  });

  it('rejects invalid input and out-of-range next dates', () => {
    expect(() => nextWorkOrderRecurrenceVisit('2027-02-29', '2027-03-01', 'DAY', 1)).toThrow();
    expect(() => nextWorkOrderRecurrenceVisit('2027-01-01', '2026-12-31', 'DAY', 1)).toThrow();
    expect(() => nextWorkOrderRecurrenceVisit('2026-01-01', '2026-01-01', 'MONTH', 0)).toThrow();
    expect(() => nextWorkOrderRecurrenceVisit('9999-12-31', '9999-12-31', 'DAY', 1)).toThrow();
  });
});
