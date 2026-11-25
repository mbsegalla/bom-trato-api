import { describe, expect, it } from 'vitest';

import type { WorkOrderRecurrenceSettings } from './workOrderRecurrence.policy.js';
import { workOrderRecurrenceDate, WorkOrderRecurrencePolicy } from './workOrderRecurrence.policy.js';

const completedAt = new Date('2026-11-20T20:00:00.000Z');
const now = new Date('2026-11-26T02:59:59.000Z');

const input: WorkOrderRecurrenceSettings = {
  intervalUnit: 'MONTH',
  intervalCount: 1,
  nextVisitOn: '2026-12-25',
  enabled: true,
  version: 0,
};

function configure(patch: Partial<WorkOrderRecurrenceSettings> = {}, currentVersion = 0) {
  return WorkOrderRecurrencePolicy.configure({ ...input, ...patch }, currentVersion, completedAt, now);
}

describe('work order recurrence policy', () => {
  it('creates an independent version-one configuration without changing the input', () => {
    const source = { ...input };
    const settings = WorkOrderRecurrencePolicy.configure(source, 0, completedAt, now);

    expect(settings).toEqual({ ...input, version: 1 });
    expect(source).toEqual(input);
  });

  it('increments the current version on edit', () => {
    expect(configure({ version: 5, intervalCount: 3 }, 5)).toEqual({
      ...input,
      intervalCount: 3,
      version: 6,
    });
  });

  it.each([
    { intervalUnit: 'DAY', intervalCount: 365 },
    { intervalUnit: 'WEEK', intervalCount: 52 },
    { intervalUnit: 'MONTH', intervalCount: 12 },
  ] satisfies Partial<WorkOrderRecurrenceSettings>[])('accepts the limit for $intervalUnit', (patch) => {
    expect(configure(patch)).toMatchObject(patch);
  });

  it.each([
    { intervalCount: 0 },
    { intervalCount: -1 },
    { intervalCount: 1.5 },
    { intervalCount: Number.NaN },
    { intervalUnit: 'DAY', intervalCount: 366 },
    { intervalUnit: 'WEEK', intervalCount: 53 },
    { intervalUnit: 'MONTH', intervalCount: 13 },
    { nextVisitOn: '' },
    { nextVisitOn: '2027-02-29' },
    { nextVisitOn: '2027-04-31' },
    { nextVisitOn: '2026-12-25T00:00:00Z' },
    { nextVisitOn: '2026-11-19', enabled: false },
    { nextVisitOn: '2026-11-24', enabled: true },
  ] satisfies Partial<WorkOrderRecurrenceSettings>[])('rejects invalid configuration %j', (patch) => {
    expect(() => configure(patch)).toThrow('INVALID_WORK_ORDER_RECURRENCE');
  });

  it('accepts leap day and same-day visits in the business timezone', () => {
    expect(configure({ nextVisitOn: '2028-02-29' }).nextVisitOn).toBe('2028-02-29');
    expect(configure({ nextVisitOn: '2026-11-25' }).nextVisitOn).toBe('2026-11-25');
  });

  it('allows pausing an overdue configuration but not reactivating it without a current date', () => {
    const overdue = configure({ version: 1, enabled: false, nextVisitOn: '2026-11-21' }, 1);

    expect(overdue).toMatchObject({ enabled: false, nextVisitOn: '2026-11-21', version: 2 });
    expect(() => configure({ ...overdue, enabled: true }, 2)).toThrow('INVALID_WORK_ORDER_RECURRENCE');
  });

  it.each([
    { requested: 0, current: 1 },
    { requested: 1, current: 0 },
    { requested: -1, current: 0 },
    { requested: 1.5, current: 1 },
    { requested: 2147483647, current: 2147483647 },
  ])('rejects a stale or invalid version %j', ({ requested, current }) => {
    expect(() => configure({ version: requested }, current)).toThrow('WORK_ORDER_RECURRENCE_VERSION_CONFLICT');
  });

  it('uses the local completion and current day, not UTC or the server timezone', () => {
    expect(workOrderRecurrenceDate(now)).toBe('2026-11-25');
    expect(workOrderRecurrenceDate(new Date('2026-11-26T03:00:00Z'))).toBe('2026-11-26');

    const completedNearMidnight = new Date('2026-11-21T02:00:00Z');
    const settings = WorkOrderRecurrencePolicy.configure(
      { ...input, nextVisitOn: '2026-11-20', enabled: false },
      0,
      completedNearMidnight,
      now,
    );

    expect(settings.nextVisitOn).toBe('2026-11-20');
  });
});
