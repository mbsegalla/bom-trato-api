import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

import type { PaymentMethodUpdateProps } from '../../domain/entities/paymentMethodUpdate.entity.js';

import { StripePaymentMethodGateway } from './stripePaymentMethod.gateway.js';

const actor = { customerId: 'cus_fixture', subscriptionId: 'sub_fixture' };
const input = { ...actor, updateId: 'update-fixture', paymentMethodId: 'pm_fixture' };
const subscription = {
  id: actor.subscriptionId,
  customer: actor.customerId,
  status: 'active',
  collection_method: 'charge_automatically',
  schedule: null,
  default_payment_method: 'pm_fixture',
  default_source: null,
};
const paymentMethod = {
  customer: actor.customerId,
  type: 'card',
  card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 },
};
const intent = {
  id: 'seti_fixture',
  customer: { id: actor.customerId },
  payment_method: { id: input.paymentMethodId },
  metadata: { paymentMethodUpdateId: input.updateId },
  status: 'requires_confirmation',
  client_secret: 'fixture-secret',
};
const date = new Date('2026-01-01T00:00:00Z');
const update: PaymentMethodUpdateProps = {
  id: input.updateId,
  organizationId: 'org',
  requestedById: 'owner',
  stripeCustomerId: actor.customerId,
  stripeSubscriptionId: actor.subscriptionId,
  stripeSetupIntentId: null,
  status: 'PENDING',
  consentVersion: '1',
  consentAcceptedAt: date,
  expiresAt: date,
  createdAt: date,
};

function fixture() {
  const list = vi.fn().mockReturnValue([subscription]);
  const create = vi.fn().mockResolvedValue(intent);
  const retrieveSetup = vi.fn().mockResolvedValue(intent);
  const cancelSetup = vi.fn().mockResolvedValue({ ...intent, status: 'canceled' });
  const retrievePaymentMethod = vi.fn().mockResolvedValue(paymentMethod);
  const updateSubscription = vi.fn().mockResolvedValue(undefined);
  const retrieveCustomer = vi.fn().mockResolvedValue({
    deleted: false,
    invoice_settings: { default_payment_method: { id: 'pm_fixture' } },
  });
  const updateCustomer = vi.fn().mockResolvedValue(undefined);
  const retrieveSchedule = vi
    .fn()
    .mockResolvedValue({ metadata: { planChangeId: 'change' }, phases: [{ default_payment_method: null }] });
  const updateSchedule = vi.fn().mockResolvedValue(undefined);
  const gateway = new StripePaymentMethodGateway({
    setupIntents: { create, retrieve: retrieveSetup, cancel: cancelSetup },
    subscriptions: { list, update: updateSubscription },
    customers: { retrieve: retrieveCustomer, update: updateCustomer },
    paymentMethods: { retrieve: retrievePaymentMethod },
    subscriptionSchedules: { retrieve: retrieveSchedule, update: updateSchedule },
  } as unknown as Stripe);

  return {
    gateway,
    list,
    create,
    retrieveSetup,
    cancelSetup,
    retrievePaymentMethod,
    updateSubscription,
    retrieveCustomer,
    updateCustomer,
    retrieveSchedule,
    updateSchedule,
  };
}

describe('StripePaymentMethodGateway', () => {
  it('creates a scoped off-session card setup with a stable idempotency key', async () => {
    const f = fixture();

    expect(await f.gateway.createSetup(update)).toEqual({
      id: intent.id,
      customerId: actor.customerId,
      paymentMethodId: input.paymentMethodId,
      updateId: input.updateId,
      status: intent.status,
      clientSecret: intent.client_secret,
    });
    expect(f.create).toHaveBeenCalledWith(
      {
        customer: actor.customerId,
        usage: 'off_session',
        payment_method_types: ['card'],
        metadata: {
          paymentMethodUpdateId: update.id,
          organizationId: update.organizationId,
          subscriptionId: actor.subscriptionId,
        },
      },
      { idempotencyKey: 'payment-method-setup:' + update.id },
    );
  });

  it('returns null identifiers for a setup that has not collected a payment method', async () => {
    const f = fixture();
    f.retrieveSetup.mockResolvedValueOnce({
      ...intent,
      customer: null,
      payment_method: null,
      metadata: {},
      client_secret: null,
    });

    expect(await f.gateway.retrieveSetup(intent.id)).toMatchObject({
      customerId: null,
      paymentMethodId: null,
      updateId: null,
      clientSecret: null,
    });
  });

  it('recovers a successful setup if cancellation races with confirmation', async () => {
    const f = fixture();
    const error = new Stripe.errors.StripeInvalidRequestError({ message: 'Fixture already confirmed' });
    f.cancelSetup.mockRejectedValueOnce(error);
    f.retrieveSetup.mockResolvedValueOnce({ ...intent, status: 'succeeded' });

    expect(await f.gateway.cancelSetup(intent.id)).toMatchObject({ status: 'succeeded' });
    expect(f.retrieveSetup).toHaveBeenCalledWith(intent.id);
  });

  it('rejects multiple ongoing subscriptions before any card read or write', async () => {
    const f = fixture();
    f.list.mockReturnValueOnce([subscription, { ...subscription, id: 'sub_other' }]);

    await expect(f.gateway.apply(input)).rejects.toThrow('MULTIPLE_SUBSCRIPTIONS');

    expect(f.retrievePaymentMethod).not.toHaveBeenCalled();
    expect(f.updateSubscription).not.toHaveBeenCalled();
    expect(f.updateCustomer).not.toHaveBeenCalled();
  });

  it.each([
    { id: 'sub_other' },
    { customer: 'cus_other' },
    { status: 'incomplete' },
    { collection_method: 'send_invoice' },
  ])('rejects an invalid subscription identity or state: %j', async (change) => {
    const f = fixture();
    f.list.mockReturnValueOnce([{ ...subscription, ...change }]);

    await expect(f.gateway.current(actor)).rejects.toThrow('INVALID_SUBSCRIPTION_STATE');

    expect(f.retrievePaymentMethod).not.toHaveBeenCalled();
  });

  it('ignores terminal subscriptions and returns only non-sensitive card summary fields', async () => {
    const f = fixture();
    f.list.mockReturnValueOnce([{ ...subscription, id: 'sub_old', status: 'canceled' }, subscription]);

    expect(await f.gateway.current(actor)).toEqual({ brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 });
    expect(f.list).toHaveBeenCalledWith({ customer: actor.customerId, status: 'all', limit: 100 });
    expect(f.retrieveCustomer).not.toHaveBeenCalled();
  });

  it('falls back to the customer default card and ignores incompatible or foreign methods', async () => {
    const f = fixture();
    f.list.mockReturnValue([{ ...subscription, default_payment_method: null }]);

    expect(await f.gateway.current(actor)).toMatchObject({ last4: '4242' });
    expect(f.retrieveCustomer).toHaveBeenCalledWith(actor.customerId);

    f.retrievePaymentMethod.mockResolvedValueOnce({ ...paymentMethod, customer: 'cus_other' });
    expect(await f.gateway.current(actor)).toBeNull();

    f.retrievePaymentMethod.mockResolvedValueOnce({ ...paymentMethod, type: 'pix' });
    expect(await f.gateway.current(actor)).toBeNull();
  });

  it('never applies a card owned by a different customer', async () => {
    const f = fixture();
    f.retrievePaymentMethod.mockResolvedValueOnce({ ...paymentMethod, customer: 'cus_other' });

    await expect(f.gateway.apply(input)).rejects.toThrow('INVALID_PAYMENT_METHOD_UPDATE');

    expect(f.updateSubscription).not.toHaveBeenCalled();
    expect(f.updateCustomer).not.toHaveBeenCalled();
  });

  it('applies the card to the subscription, customer and owned schedule with separate idempotency keys', async () => {
    const f = fixture();
    f.list.mockReturnValueOnce([{ ...subscription, schedule: { id: 'sched_fixture' } }]);

    await f.gateway.apply(input);

    expect(f.updateSubscription).toHaveBeenCalledWith(
      actor.subscriptionId,
      {
        default_payment_method: input.paymentMethodId,
      },
      { idempotencyKey: 'payment-method-subscription:' + input.updateId },
    );
    expect(f.updateCustomer).toHaveBeenCalledWith(
      actor.customerId,
      {
        invoice_settings: { default_payment_method: input.paymentMethodId },
      },
      { idempotencyKey: 'payment-method-customer:' + input.updateId },
    );
    expect(f.updateSchedule).toHaveBeenCalledWith(
      'sched_fixture',
      {
        default_settings: { default_payment_method: input.paymentMethodId },
      },
      { idempotencyKey: 'payment-method-schedule:' + input.updateId },
    );
  });

  it('blocks card changes when a subscription schedule has a foreign owner or explicit phase payment method', async () => {
    const f = fixture();
    f.list.mockReturnValue([{ ...subscription, schedule: 'sched_fixture' }]);
    f.retrieveSchedule.mockResolvedValueOnce({ metadata: {}, phases: [] }).mockResolvedValueOnce({
      metadata: { planChangeId: 'change' },
      phases: [{ default_payment_method: 'pm_other' }],
    });

    await expect(f.gateway.apply(input)).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    await expect(f.gateway.apply(input)).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');

    expect(f.updateSubscription).not.toHaveBeenCalled();
    expect(f.updateCustomer).not.toHaveBeenCalled();
    expect(f.updateSchedule).not.toHaveBeenCalled();
  });
});
