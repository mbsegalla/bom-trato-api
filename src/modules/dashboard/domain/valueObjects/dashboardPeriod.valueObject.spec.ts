import { describe, expect, it } from 'vitest';

import { DashboardPeriod } from './dashboardPeriod.valueObject.js';

const from = new Date('2026-01-01T00:00:00Z');
const at = (days: number) => new Date(from.getTime() + days * 86_400_000);

describe('DashboardPeriod', () => {
  it('accepts the maximum inclusive duration and isolates mutable date snapshots', () => {
    const period = DashboardPeriod.create(from, at(366));
    period.snapshot().from.setTime(0);
    expect(period.snapshot()).toEqual({ from, to: at(366) });
  });

  it.each([0, -1, 367, NaN])('rejects invalid or excessive periods: %s days', (days) => {
    expect(() => DashboardPeriod.create(from, at(days))).toThrow('INVALID_DASHBOARD_PERIOD');
  });
});
