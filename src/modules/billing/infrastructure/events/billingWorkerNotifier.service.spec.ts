import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { BILLING_SCHEDULE_CHANGED_EVENT, BILLING_WORK_AVAILABLE_EVENT, BillingWork } from './billing.events.js';
import { BillingWorkerNotifier } from './billingWorkerNotifier.service.js';

describe('BillingWorkerNotifier', () => {
  it('routes each supported work type to the correct event channel', () => {
    const emitter = new EventEmitter2();
    const available = vi.fn();
    const changed = vi.fn();
    emitter.on(BILLING_WORK_AVAILABLE_EVENT, available);
    emitter.on(BILLING_SCHEDULE_CHANGED_EVENT, changed);

    const notifier = new BillingWorkerNotifier(emitter);

    for (const work of Object.values(BillingWork)) {
      notifier.notify(work);
      notifier.scheduleChanged(work);
    }

    expect(available.mock.calls.map(([work]) => work)).toEqual(Object.values(BillingWork));
    expect(changed.mock.calls.map(([work]) => work)).toEqual(Object.values(BillingWork));
  });

  it('ignores invalid work names instead of dispatching unknown jobs', () => {
    const emitter = new EventEmitter2();
    const emit = vi.spyOn(emitter, 'emit');
    const notifier = new BillingWorkerNotifier(emitter);

    notifier.notify('invalid' as BillingWork);
    notifier.scheduleChanged('invalid' as BillingWork);

    expect(emit).not.toHaveBeenCalled();
  });

  it('contains listener failures so durable work remains eligible for recovery', () => {
    const emitter = new EventEmitter2();
    const fail = vi.fn(() => {
      throw new Error('fixture listener failure');
    });
    emitter.on(BILLING_WORK_AVAILABLE_EVENT, fail);
    emitter.on(BILLING_SCHEDULE_CHANGED_EVENT, fail);

    const notifier = new BillingWorkerNotifier(emitter);

    expect(() => notifier.notify(BillingWork.WEBHOOKS)).not.toThrow();
    expect(() => notifier.scheduleChanged(BillingWork.WEBHOOKS)).not.toThrow();
    expect(fail).toHaveBeenCalledTimes(2);
  });
});
