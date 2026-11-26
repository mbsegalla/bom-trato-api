import { describe, expect, it } from 'vitest';

import { PublicWorkOrderTimelinePolicy } from './publicWorkOrderTimeline.policy.js';
import type { PublicWorkOrderScheduleHistory, PublicWorkOrderStatusHistory } from './publicWorkOrderTimeline.policy.js';
const at = (day: number) => new Date(Date.UTC(2026, 0, day));
describe('PublicWorkOrderTimelinePolicy', () => {
  it('sorts real transitions, links scheduling by version and excludes future or duplicate status events', () => {
    const statusHistory: PublicWorkOrderStatusHistory[] = [
      { fromStatus: 'IN_PROGRESS', toStatus: 'COMPLETED', version: 5, createdAt: at(6) },
      { fromStatus: 'OPEN', toStatus: 'SCHEDULED', version: 2, createdAt: at(2) },
      { fromStatus: 'SCHEDULED', toStatus: 'IN_PROGRESS', version: 4, createdAt: at(4) },
      { fromStatus: 'SCHEDULED', toStatus: 'SCHEDULED', version: 3, createdAt: at(3) },
    ];
    const initial: PublicWorkOrderScheduleHistory = { fromStatus: 'OPEN', toStatus: 'SCHEDULED', fromStartAt: null, fromEndAt: null, toStartAt: at(4), toEndAt: at(5), version: 2, createdAt: at(2) };
    const scheduleHistory: PublicWorkOrderScheduleHistory[] = [initial, { ...initial, fromStatus: 'SCHEDULED', fromStartAt: at(4), fromEndAt: at(5), toStartAt: at(5), toEndAt: at(6), version: 3, createdAt: at(3) }];
    const events = PublicWorkOrderTimelinePolicy.resolve({ quoteApprovedAt: at(1), createdAt: at(1), statusHistory, scheduleHistory }, at(5));
    expect(events.map((event) => event.type)).toEqual(['QUOTE_APPROVED', 'WORK_ORDER_CREATED', 'WORK_ORDER_SCHEDULED', 'WORK_ORDER_RESCHEDULED', 'WORK_ORDER_STARTED']);
    expect(events[2]).toMatchObject({ scheduledStartAt: at(4), scheduledEndAt: at(5) });
    expect(events[3]).toMatchObject({ scheduledStartAt: at(5), scheduledEndAt: at(6) });
    expect(events[4]).toMatchObject({ scheduledStartAt: null, scheduledEndAt: null });
  });
  it('does not fabricate approval after creation or a reschedule with invalid dates', () => {
    const events = PublicWorkOrderTimelinePolicy.resolve({ quoteApprovedAt: at(2), createdAt: at(1), statusHistory: [], scheduleHistory: [{ fromStatus: 'SCHEDULED', toStatus: 'SCHEDULED', fromStartAt: at(3), fromEndAt: at(4), toStartAt: at(5), toEndAt: at(4), version: 2, createdAt: at(2) }] }, at(5));
    expect(events.map((event) => event.type)).toEqual(['WORK_ORDER_CREATED']);
  });
});
