import { describe, expect, it } from 'vitest';

import { WorkOrderSchedulePeriod } from './workOrderSchedulePeriod.valueObject.js';

const start = new Date('2026-01-01T00:00:00Z');
const at = (days: number) => new Date(start.getTime() + days * 86400000);

describe('WorkOrderSchedulePeriod', () => {
  it('allows 31 days and detaches dates from caller mutation', () => {
    const period = WorkOrderSchedulePeriod.create(start, at(31));
    period.snapshot().from.setTime(0);

    expect(period.snapshot()).toEqual({ from: start, to: at(31) });
  });

  it.each([-1, 0, 31.00001, NaN])('rejects invalid duration %s', (days) => {
    expect(() => WorkOrderSchedulePeriod.create(start, at(days))).toThrow('INVALID_SCHEDULE_PERIOD');
  });
});
