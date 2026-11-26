import { afterEach, describe, expect, it, vi } from 'vitest';

import { BillingError } from '../../domain/errors/billing.error.js';
import type { ClaimedWebhookJob } from '../../domain/types/billing.types.js';
import { BillingWork } from '../events/billing.events.js';
import { BillingWebhookWorker } from './billingWebhook.worker.js';

const event: ClaimedWebhookJob = {
  id: 'evt_fixture', type: 'invoice.paid', stripeCustomerId: 'cus_fixture',
  stripeObjectId: 'in_fixture', attempts: 0, leaseToken: 'lease',
  receivedAt: new Date('2026-01-01T00:00:00Z'),
};

function fixture(workerEnabled = true) {
  const catalog = { executeWebhook: vi.fn().mockResolvedValue(undefined) };
  const plan = { execute: vi.fn().mockResolvedValue(undefined) };
  const sync = { execute: vi.fn().mockResolvedValue(undefined) };
  const payment = { execute: vi.fn().mockResolvedValue(undefined) };
  const alert = { execute: vi.fn().mockResolvedValue(undefined) };
  const confirmation = { execute: vi.fn().mockResolvedValue(false) };
  const deleted = { execute: vi.fn().mockResolvedValue(undefined) };
  const billing = {
    customerByStripeId: vi.fn().mockResolvedValue({ organizationId: 'org', stripeCustomerId: 'cus_fixture' }),
    dueCustomers: vi.fn().mockResolvedValue([]),
    postponeReconciliation: vi.fn().mockResolvedValue(undefined),
  };
  const webhook = {
    claimEvent: vi.fn().mockResolvedValue(null),
    renewEventLease: vi.fn().mockResolvedValue(true),
    settleEvent: vi.fn().mockResolvedValue(true),
  };
  const changes = { due: vi.fn().mockResolvedValue([]), postpone: vi.fn().mockResolvedValue(undefined) };
  const updates = { due: vi.fn().mockResolvedValue([]), postpone: vi.fn().mockResolvedValue(undefined) };
  const schedule = { nextRunAt: vi.fn().mockResolvedValue(null) };
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const scheduler = {
    doesExist: vi.fn((_type: string, name: string) => timers.has(name)),
    addTimeout: vi.fn((name: string, timer: ReturnType<typeof setTimeout>) => { timers.set(name, timer); }),
    deleteTimeout: vi.fn((name: string) => {
      clearTimeout(timers.get(name));
      timers.delete(name);
    }),
  };
  const args = [
    { workerEnabled }, catalog, plan, sync, payment, alert, confirmation, deleted,
    billing, webhook, changes, updates, schedule, scheduler,
  ] as unknown as ConstructorParameters<typeof BillingWebhookWorker>;
  const worker = new BillingWebhookWorker(...args);

  return { worker, catalog, plan, sync, payment, alert, confirmation, deleted, billing, webhook, changes, updates, schedule, scheduler };
}

describe('BillingWebhookWorker', () => {
  const workers: BillingWebhookWorker[] = [];

  function setup(enabled = true) {
    const f = fixture(enabled);
    workers.push(f.worker);
    return f;
  }

  async function run(f: ReturnType<typeof fixture>) {
    f.worker.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
  }

  afterEach(async () => {
    for (const worker of workers.splice(0)) await worker.onModuleDestroy();
    vi.useRealTimers();
  });

  it('ignores recovery and dispatch when disabled', async () => {
    vi.useFakeTimers();
    const f = setup(false);
    await run(f);
    f.worker.handleWorkAvailable(BillingWork.WEBHOOKS);
    f.worker.handleScheduleChanged(BillingWork.WEBHOOKS);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.webhook.claimEvent).not.toHaveBeenCalled();
    expect(f.schedule.nextRunAt).not.toHaveBeenCalled();
  });

  it('drains all recovery categories on startup', async () => {
    vi.useFakeTimers();
    const f = setup();
    await run(f);
    expect(f.webhook.claimEvent).toHaveBeenCalledTimes(1);
    expect(f.changes.due).toHaveBeenCalledTimes(1);
    expect(f.updates.due).toHaveBeenCalledTimes(1);
    expect(f.confirmation.execute).toHaveBeenCalledTimes(1);
    expect(f.billing.dueCustomers).toHaveBeenCalledTimes(1);
  });

  it('routes invoice events through billing, alerts and plan reconciliation', async () => {
    vi.useFakeTimers();
    const f = setup();
    f.webhook.claimEvent.mockResolvedValueOnce(event);
    await run(f);
    expect(f.sync.execute).toHaveBeenCalledWith({ organizationId: 'org', invoiceId: 'in_fixture' });
    expect(f.alert.execute).toHaveBeenCalledWith('org', event);
    expect(f.plan.execute).toHaveBeenCalledWith('org');
    expect(f.webhook.settleEvent).toHaveBeenCalledWith(event, 'COMPLETE', undefined);
  });

  it.each(['product.created', 'product.updated', 'product.deleted', 'price.created', 'price.updated', 'price.deleted'])(
    'routes catalog event %s without looking up a customer', async (type) => {
      vi.useFakeTimers();
      const f = setup();
      const job = { ...event, type, stripeCustomerId: null };
      f.webhook.claimEvent.mockResolvedValueOnce(job);
      await run(f);
      expect(f.catalog.executeWebhook).toHaveBeenCalledWith(type, job.stripeObjectId);
      expect(f.billing.customerByStripeId).not.toHaveBeenCalled();
      expect(f.webhook.settleEvent).toHaveBeenCalledWith(job, 'COMPLETE', undefined);
    },
  );

  it('routes deletion with the persisted event timestamp', async () => {
    vi.useFakeTimers();
    const f = setup();
    const job = { ...event, type: 'customer.deleted' };
    f.webhook.claimEvent.mockResolvedValueOnce(job);
    await run(f);
    expect(f.deleted.execute).toHaveBeenCalledWith({ stripeCustomerId: job.stripeCustomerId, deletedAt: job.receivedAt });
    expect(f.sync.execute).not.toHaveBeenCalled();
  });

  it('routes setup intent events without billing alerts', async () => {
    vi.useFakeTimers();
    const f = setup();
    const job = { ...event, type: 'setup_intent.succeeded' };
    f.webhook.claimEvent.mockResolvedValueOnce(job);
    await run(f);
    expect(f.payment.execute).toHaveBeenCalledWith({ organizationId: 'org', setupIntentId: job.stripeObjectId });
    expect(f.alert.execute).not.toHaveBeenCalled();
  });

  it('ignores detached customers without changing billing state', async () => {
    vi.useFakeTimers();
    const f = setup();
    f.billing.customerByStripeId.mockResolvedValue({ organizationId: 'org', stripeCustomerId: 'different' });
    f.webhook.claimEvent.mockResolvedValueOnce(event);
    await run(f);
    expect(f.sync.execute).not.toHaveBeenCalled();
    expect(f.webhook.settleEvent).toHaveBeenCalledWith(event, 'COMPLETE', undefined);
  });

  it.each(['invoice.paid', 'customer.deleted'])('requires customer identity for %s', async (type) => {
    vi.useFakeTimers();
    const f = setup();
    const job = { ...event, type, stripeCustomerId: null };
    f.webhook.claimEvent.mockResolvedValueOnce(job);
    await run(f);
    expect(f.webhook.settleEvent).toHaveBeenCalledWith(job, 'RETRY', 'BILLING_RECONCILIATION_REQUIRED');
  });

  it('retries unmatched customers without performing writes', async () => {
    vi.useFakeTimers();
    const f = setup();
    f.billing.customerByStripeId.mockResolvedValue(null);
    f.webhook.claimEvent.mockResolvedValueOnce(event);
    await run(f);
    expect(f.sync.execute).not.toHaveBeenCalled();
    expect(f.webhook.settleEvent).toHaveBeenCalledWith(event, 'RETRY', 'BILLING_RECONCILIATION_REQUIRED');
  });

  it.each([
    [new BillingError('BILLING_BUSY'), 'DEFER', undefined],
    [new BillingError('BILLING_WRITE_FAILED'), 'RETRY', 'BILLING_WRITE_FAILED'],
    [new Error('provider failure'), 'RETRY', 'WEBHOOK_PROCESSING_FAILED'],
  ] as const)('settles processing failures safely', async (error, outcome, code) => {
    vi.useFakeTimers();
    const f = setup();
    f.webhook.claimEvent.mockResolvedValueOnce(event);
    f.sync.execute.mockRejectedValueOnce(error);
    await run(f);
    expect(f.webhook.settleEvent).toHaveBeenCalledWith(event, outcome, code);
    expect(f.alert.execute).not.toHaveBeenCalled();
  });

  it('postpones failed plan changes, payment updates and customer reconciliation', async () => {
    vi.useFakeTimers();
    const f = setup();
    f.changes.due.mockResolvedValue([{ id: 'change', organizationId: 'org' }]);
    f.updates.due.mockResolvedValue([{ id: 'update', organizationId: 'org' }]);
    f.billing.dueCustomers.mockResolvedValue([{ organizationId: 'org' }]);
    f.plan.execute.mockRejectedValue(new BillingError('BILLING_BUSY'));
    f.payment.execute.mockRejectedValue(new Error('failed'));
    f.sync.execute.mockRejectedValue(new Error('failed'));
    await run(f);
    expect(f.changes.postpone).toHaveBeenCalledWith('change', 60);
    expect(f.updates.postpone).toHaveBeenCalledWith('update', 60);
    expect(f.billing.postponeReconciliation).toHaveBeenCalledWith('org');
  });

  it('schedules retry when claiming a webhook fails', async () => {
    vi.useFakeTimers();
    const f = setup();
    f.webhook.claimEvent.mockRejectedValueOnce(new Error('database unavailable'));
    await run(f);
    expect(f.scheduler.addTimeout).toHaveBeenCalledWith('billing-webhooks-next-run', expect.anything());
  });

  it('refreshes schedule without processing a new batch', async () => {
    vi.useFakeTimers();
    const f = setup();
    await run(f);
    f.schedule.nextRunAt.mockResolvedValue(new Date(Date.now() + 1000));
    f.worker.handleScheduleChanged(BillingWork.WEBHOOKS);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.webhook.claimEvent).toHaveBeenCalledTimes(1);
    expect(f.scheduler.addTimeout).toHaveBeenCalledWith('billing-webhooks-next-run', expect.anything());
  });

  it('does not acknowledge work after losing its lease during provider I/O', async () => {
    vi.useFakeTimers();
    const f = setup();
    f.webhook.claimEvent.mockResolvedValueOnce(event);
    f.webhook.renewEventLease.mockResolvedValue(false);
    f.sync.execute.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 21000));
    });
    await run(f);
    await vi.advanceTimersByTimeAsync(21000);
    expect(f.webhook.renewEventLease).toHaveBeenCalledWith(event);
    expect(f.alert.execute).not.toHaveBeenCalled();
    expect(f.webhook.settleEvent).not.toHaveBeenCalled();
  });
});
