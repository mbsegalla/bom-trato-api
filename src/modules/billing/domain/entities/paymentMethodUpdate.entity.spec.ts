import { describe, expect, it } from 'vitest';

import { PaymentMethodUpdate } from './paymentMethodUpdate.entity.js';
const now = new Date('2026-01-01T00:00:00Z');
const expiresAt = new Date(now.getTime() + 60000);
const create = () => PaymentMethodUpdate.create({ id: 'update', organizationId: 'org', requestedById: 'owner', stripeCustomerId: 'cus_fixture', stripeSubscriptionId: 'sub_fixture', consentVersion: '1', consentAcceptedAt: now, expiresAt });
const setup = { id: 'seti_fixture', customerId: 'cus_fixture', updateId: 'update' };
describe('PaymentMethodUpdate', () => {
  it('binds the setup to the customer, operation and immutable provider identity', () => {
    const value = create();
    expect(() => value.assertBelongsTo('other')).toThrow('PAYMENT_METHOD_UPDATE_NOT_FOUND');
    expect(value.wasRequestedBy('other')).toBe(false);
    for (const patch of [{ customerId: 'other' }, { updateId: 'other' }, { customerId: null }]) {
      expect(() => value.attachSetup({ ...setup, ...patch })).toThrow('INVALID_PAYMENT_METHOD_UPDATE');
    }
    value.attachSetup(setup);
    value.attachSetup(setup);
    expect(() => value.attachSetup({ ...setup, id: 'other' })).toThrow('INVALID_PAYMENT_METHOD_UPDATE');
    expect(value.snapshot().stripeSetupIntentId).toBe(setup.id);
  });
  it('only confirms a live pending setup before expiry and never cancels successful or processing setups', () => {
    const value = create();
    expect(value.canConfirmSetup('requires_action', now)).toBe(true);
    expect(value.canConfirmSetup('requires_action', expiresAt)).toBe(false);
    expect(value.shouldCancelSetup('requires_action', expiresAt)).toBe(true);
    for (const status of ['processing', 'succeeded', 'canceled'] as const) {
      expect(value.shouldCancelSetup(status, expiresAt)).toBe(false);
      expect(value.canConfirmSetup(status, now)).toBe(false);
    }
  });
  it('preserves terminal outcomes and returns a restricted public view', () => {
    const value = create();
    value.markApplied();
    value.markApplied();
    expect(value.isPending()).toBe(false);
    expect(() => value.markCanceled()).toThrow('INVALID_PAYMENT_METHOD_UPDATE');
    expect(value.toPublic()).toEqual({ updateId: 'update', status: 'APPLIED', clientSecret: null });
  });
  it.each(['CANCELED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED'])('rejects setup changes on %s subscriptions', (status) => {
    expect(() => PaymentMethodUpdate.assertSubscriptionCanUpdate(status)).toThrow('INVALID_SUBSCRIPTION_STATE');
  });
});
