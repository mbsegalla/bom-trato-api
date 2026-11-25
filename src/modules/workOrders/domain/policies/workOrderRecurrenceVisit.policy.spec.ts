import { describe, expect, it } from 'vitest';

import { workOrderRecurrenceDate } from './workOrderRecurrence.policy.js';
import { workOrderRecurrenceVisitFilter } from './workOrderRecurrenceVisit.policy.js';

describe('work order recurrence visit filter', () => {
  it('leaves the next visit date unfiltered when no period is selected', () => {
    expect(workOrderRecurrenceVisitFilter('2026-12-30')).toBeUndefined();
  });

  it('excludes today from overdue dates', () => {
    expect(workOrderRecurrenceVisitFilter('2026-12-30', 'OVERDUE')).toEqual({
      lt: new Date('2026-12-30T00:00:00.000Z'),
    });
  });

  it('uses the business calendar day at midnight in Sao Paulo', () => {
    const today = workOrderRecurrenceDate(new Date('2026-12-31T02:59:59.000Z'));

    expect(workOrderRecurrenceVisitFilter(today, 'TODAY')).toEqual({
      gte: new Date('2026-12-30T00:00:00.000Z'),
      lte: new Date('2026-12-30T00:00:00.000Z'),
    });
  });

  it('includes today through seven days ahead across the year boundary', () => {
    expect(workOrderRecurrenceVisitFilter('2026-12-30', 'NEXT_SEVEN_DAYS')).toEqual({
      gte: new Date('2026-12-30T00:00:00.000Z'),
      lte: new Date('2027-01-06T00:00:00.000Z'),
    });
  });

  it('handles a leap day without local timezone conversion', () => {
    expect(workOrderRecurrenceVisitFilter('2028-02-25', 'NEXT_SEVEN_DAYS')?.lte).toEqual(
      new Date('2028-03-03T00:00:00.000Z'),
    );
  });
});
