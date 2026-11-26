import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

import type { PlanChangeProps } from '../../domain/entities/planChange.entity.js';

import { StripePlanChangeGateway } from './stripePlanChange.gateway.js';

const change: PlanChangeProps = {
  id: 'change',
  organizationId: 'org',
  requestedById: 'owner',
  sourcePlanPriceId: 'source',
  targetPlanPriceId: 'target',
  targetMaxUsers: 5,
  stripeCustomerId: 'cus_fixture',
  stripeSubscriptionId: 'sub_fixture',
  stripeItemId: 'si_fixture',
  sourceStripePriceId: 'price_source',
  targetStripePriceId: 'price_target',
  mode: 'IMMEDIATE',
  status: 'PROCESSING',
  currency: 'brl',
  amountDueNow: 500,
  targetAmountInCents: 3000,
  targetInterval: 'MONTH',
  targetIntervalCount: 1,
  periodStart: 1800000000,
  periodEnd: 1802592000,
  prorationDate: 1800100000,
  expiresAt: new Date('2027-01-16T00:00:00Z'),
  startedAt: null,
  stripeInvoiceId: null,
  stripeScheduleId: null,
};
const actor = { customerId: change.stripeCustomerId, subscriptionId: change.stripeSubscriptionId };
const item = {
  id: change.stripeItemId,
  quantity: 1,
  price: { id: change.sourceStripePriceId, billing_scheme: 'per_unit', recurring: { usage_type: 'licensed' } },
  current_period_start: change.periodStart,
  current_period_end: change.periodEnd,
  discounts: [],
  tax_rates: [],
  billing_thresholds: null,
};
const subscription = {
  id: actor.subscriptionId,
  customer: actor.customerId,
  items: { data: [item], has_more: false },
  status: 'active',
  collection_method: 'charge_automatically',
  cancel_at_period_end: false,
  cancel_at: null,
  pending_update: null,
  schedule: null,
  pause_collection: null,
  discounts: [],
  default_tax_rates: [],
  automatic_tax: { enabled: false },
  billing_thresholds: null,
  transfer_data: null,
  on_behalf_of: null,
  application_fee_percent: null,
  latest_invoice: 'in_fixture',
  metadata: {},
};
const invoice = {
  id: 'in_fixture',
  status: 'paid',
  customer: actor.customerId,
  parent: { subscription_details: { subscription: actor.subscriptionId } },
};
const applied = {
  ...subscription,
  metadata: { planChangeId: change.id },
  items: { data: [{ ...item, price: { ...item.price, id: change.targetStripePriceId } }], has_more: false },
};

function fixture() {
  const retrieveSubscription = vi.fn().mockResolvedValue(subscription);
  const retrieveInvoice = vi.fn().mockResolvedValue(invoice);
  const listInvoiceItems = vi.fn().mockResolvedValue({ data: [] });
  const preview = vi.fn().mockResolvedValue({ currency: 'brl', amount_due: 500 });
  const updateSubscription = vi.fn().mockResolvedValue(undefined);
  const createSchedule = vi.fn().mockResolvedValue({ id: 'sched_fixture', current_phase: null });
  const updateSchedule = vi.fn().mockResolvedValue(undefined);
  const retrieveSchedule = vi.fn().mockResolvedValue({
    metadata: { planChangeId: change.id },
    status: 'active',
    phases: [{ start_date: change.periodEnd, items: [{ price: change.targetStripePriceId }] }],
  });
  const releaseSchedule = vi.fn().mockResolvedValue(undefined);
  const voidInvoice = vi.fn().mockResolvedValue(undefined);
  const gateway = new StripePlanChangeGateway({
    subscriptions: { retrieve: retrieveSubscription, update: updateSubscription },
    invoices: { retrieve: retrieveInvoice, createPreview: preview, voidInvoice },
    invoiceItems: { list: listInvoiceItems },
    subscriptionSchedules: {
      create: createSchedule,
      update: updateSchedule,
      retrieve: retrieveSchedule,
      release: releaseSchedule,
    },
  } as unknown as Stripe);

  return {
    gateway,
    retrieveSubscription,
    retrieveInvoice,
    listInvoiceItems,
    preview,
    updateSubscription,
    createSchedule,
    updateSchedule,
    retrieveSchedule,
    releaseSchedule,
    voidInvoice,
  };
}

describe('StripePlanChangeGateway', () => {
  it('reads only a supported single-item paid subscription belonging to the customer', async () => {
    const f = fixture();

    expect(await f.gateway.source(actor)).toEqual({
      stripeItemId: item.id,
      stripePriceId: item.price.id,
      periodStart: item.current_period_start,
      periodEnd: item.current_period_end,
    });
    expect(f.retrieveInvoice).toHaveBeenCalledWith(invoice.id);
    expect(f.listInvoiceItems).toHaveBeenCalledWith({ customer: actor.customerId, pending: true, limit: 1 });
  });

  it('rejects another customer before reading invoice information', async () => {
    const f = fixture();
    f.retrieveSubscription.mockResolvedValueOnce({ ...subscription, customer: 'cus_other' });

    await expect(f.gateway.source(actor)).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');

    expect(f.retrieveInvoice).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'past_due' },
    { cancel_at_period_end: true },
    { pending_update: {} },
    { items: { data: [item, item], has_more: false } },
  ])('blocks unsupported current subscription states: %j', async (state) => {
    const f = fixture();
    f.retrieveSubscription.mockResolvedValueOnce({ ...subscription, ...state });

    await expect(f.gateway.source(actor)).rejects.toThrow('INVALID_SUBSCRIPTION_STATE');
  });

  it('rejects discounts, unpaid invoices and unrelated pending invoice items', async () => {
    const f = fixture();
    f.retrieveSubscription.mockResolvedValueOnce({ ...subscription, discounts: ['discount'] });

    await expect(f.gateway.source(actor)).rejects.toThrow('PLAN_CHANGE_UNSUPPORTED');

    f.retrieveInvoice.mockResolvedValueOnce({ ...invoice, status: 'open' });
    await expect(f.gateway.source(actor)).rejects.toThrow('INVALID_SUBSCRIPTION_STATE');

    f.listInvoiceItems.mockResolvedValueOnce({ data: [{ id: 'ii_fixture' }] });
    await expect(f.gateway.source(actor)).rejects.toThrow('PLAN_CHANGE_UNSUPPORTED');
  });

  it('previews only immediate changes, preserves proration and rejects a different invoice currency', async () => {
    const f = fixture();

    expect(await f.gateway.preview({ ...change, mode: 'PERIOD_END' })).toBe(0);
    expect(f.preview).not.toHaveBeenCalled();
    expect(await f.gateway.preview(change)).toBe(500);
    expect(f.preview).toHaveBeenCalledWith({
      customer: change.stripeCustomerId,
      subscription: change.stripeSubscriptionId,
      subscription_details: {
        items: [{ id: change.stripeItemId, price: change.targetStripePriceId, quantity: 1 }],
        proration_behavior: 'always_invoice',
        proration_date: change.prorationDate,
      },
    });

    f.preview.mockResolvedValueOnce({ currency: 'usd', amount_due: 500 });
    await expect(f.gateway.preview(change)).rejects.toThrow('PRICE_MISMATCH');
  });

  it('executes an immediate change idempotently and verifies the remote applied state', async () => {
    const f = fixture();
    f.retrieveSubscription.mockResolvedValueOnce(applied);

    expect(await f.gateway.execute(change)).toMatchObject({ status: 'APPLIED', stripeInvoiceId: invoice.id });
    expect(f.updateSubscription).toHaveBeenCalledWith(
      actor.subscriptionId,
      expect.objectContaining({
        items: [{ id: change.stripeItemId, price: change.targetStripePriceId, quantity: 1 }],
        payment_behavior: 'pending_if_incomplete',
        metadata: { planChangeId: change.id },
      }),
      { idempotencyKey: 'plan-change:' + change.id },
    );
  });

  it('creates a period-end schedule with current and next prices and separate stable keys', async () => {
    const f = fixture();
    f.retrieveSubscription.mockResolvedValueOnce({ ...subscription, schedule: 'sched_fixture' });

    expect(await f.gateway.execute({ ...change, mode: 'PERIOD_END' })).toMatchObject({
      status: 'SCHEDULED',
      stripeScheduleId: 'sched_fixture',
    });
    expect(f.createSchedule).toHaveBeenCalledWith(
      { from_subscription: actor.subscriptionId },
      { idempotencyKey: 'plan-change-schedule:' + change.id },
    );
    expect(f.updateSchedule).toHaveBeenCalledWith(
      'sched_fixture',
      expect.objectContaining({
        phases: [
          expect.objectContaining({
            start_date: change.periodStart,
            end_date: change.periodEnd,
            items: [{ price: change.sourceStripePriceId, quantity: 1 }],
          }),
          expect.objectContaining({
            start_date: change.periodEnd,
            items: [{ price: change.targetStripePriceId, quantity: 1 }],
            duration: { interval: 'month', interval_count: 1 },
          }),
        ],
      }),
      { idempotencyKey: 'plan-change-phases:' + change.id },
    );
    expect(f.updateSubscription).not.toHaveBeenCalled();
  });

  it('inspects a pending payment only when both invoice customer and subscription match', async () => {
    const f = fixture();
    f.retrieveSubscription.mockResolvedValue({
      ...subscription,
      metadata: { planChangeId: change.id },
      pending_update: {},
    });
    f.retrieveInvoice.mockResolvedValueOnce({
      ...invoice,
      status: 'open',
      confirmation_secret: { client_secret: 'fixture-secret' },
    });

    expect(await f.gateway.inspect(change)).toEqual({
      status: 'PENDING_PAYMENT',
      stripeInvoiceId: invoice.id,
      stripeScheduleId: null,
      clientSecret: 'fixture-secret',
    });

    f.retrieveInvoice.mockResolvedValueOnce({ ...invoice, customer: 'cus_other' });
    await expect(f.gateway.inspect(change)).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');

    f.retrieveInvoice.mockResolvedValueOnce({ ...invoice, status: 'void' });
    expect(await f.gateway.inspect(change)).toMatchObject({ status: 'EXPIRED' });
  });

  it('does not void an already applied or unrelated change but voids the owned open invoice idempotently', async () => {
    const f = fixture();
    f.retrieveSubscription
      .mockResolvedValueOnce(applied)
      .mockResolvedValueOnce(subscription)
      .mockResolvedValueOnce({ ...subscription, metadata: { planChangeId: change.id }, pending_update: {} });
    f.retrieveInvoice.mockResolvedValueOnce({ ...invoice, status: 'open' });

    await f.gateway.cancel(change);
    await f.gateway.cancel(change);

    expect(f.voidInvoice).not.toHaveBeenCalled();

    await f.gateway.cancel(change);

    expect(f.voidInvoice).toHaveBeenCalledWith(invoice.id, {}, { idempotencyKey: 'plan-change-void:' + change.id });
  });

  it('never releases a schedule belonging to an unrelated plan change', async () => {
    const f = fixture();
    f.retrieveSubscription.mockResolvedValueOnce({ ...subscription, schedule: 'sched_fixture' });
    f.retrieveSchedule.mockResolvedValueOnce({ metadata: { planChangeId: 'other' }, status: 'active' });

    await expect(f.gateway.releaseSchedule({ ...change, mode: 'PERIOD_END' })).rejects.toThrow(
      'BILLING_RECONCILIATION_REQUIRED',
    );

    expect(f.releaseSchedule).not.toHaveBeenCalled();
  });
});
