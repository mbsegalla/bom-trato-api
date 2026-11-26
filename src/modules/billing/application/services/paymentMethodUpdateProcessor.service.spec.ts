import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PaymentMethodUpdate,
  type PaymentMethodUpdateProps,
} from '../../domain/entities/paymentMethodUpdate.entity.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PaymentMethodUpdateRepository } from '../../domain/repositories/paymentMethodUpdate.repository.js';
import type { PaymentMethodGateway, PaymentSetup } from '../ports/paymentMethodGateway.port.js';

import { PaymentMethodUpdateProcessor } from './paymentMethodUpdateProcessor.service.js';

const now = new Date('2026-01-01T12:00:00Z');
const state = PaymentMethodUpdate.create({
  id: 'update',
  organizationId: 'org',
  requestedById: 'owner',
  stripeCustomerId: 'cus_fixture',
  stripeSubscriptionId: 'sub_fixture',
  consentVersion: 'subscription-card-v1',
  consentAcceptedAt: now,
  expiresAt: new Date(now.getTime() + 7200000),
}).snapshot();
const setup: PaymentSetup = {
  id: 'seti_fixture',
  customerId: state.stripeCustomerId,
  updateId: state.id,
  paymentMethodId: null,
  status: 'requires_payment_method',
  clientSecret: 'fixture-client-secret',
};

function fixture() {
  const billing = {
    assertOwner: vi.fn().mockResolvedValue(undefined),
    customer: vi.fn().mockResolvedValue({ stripeCustomerId: state.stripeCustomerId }),
  };
  const repository = {
    save: vi.fn(async (entity: PaymentMethodUpdate) => entity.snapshot()),
    postpone: vi.fn().mockResolvedValue(undefined),
  };
  const gateway = {
    createSetup: vi.fn().mockResolvedValue(setup),
    retrieveSetup: vi.fn().mockResolvedValue(setup),
    cancelSetup: vi.fn().mockResolvedValue({ ...setup, status: 'canceled' }),
    apply: vi.fn().mockResolvedValue(undefined),
  };
  const processor = new PaymentMethodUpdateProcessor(
    billing as unknown as BillingRepository,
    repository as unknown as PaymentMethodUpdateRepository,
    gateway as unknown as PaymentMethodGateway,
  );

  return { billing, repository, gateway, processor };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => vi.useRealTimers());

describe('PaymentMethodUpdateProcessor', () => {
  it.each(['APPLIED', 'CANCELED'] as const)('does not reprocess terminal updates: %s', async (status) => {
    const f = fixture();

    expect(await f.processor.process({ ...state, status })).toEqual({
      updateId: state.id,
      status,
      clientSecret: null,
    });
    expect(f.billing.assertOwner).not.toHaveBeenCalled();
    expect(f.gateway.createSetup).not.toHaveBeenCalled();
    expect(f.gateway.apply).not.toHaveBeenCalled();
  });

  it('persists the new setup identity before postponing pending confirmation', async () => {
    const f = fixture();

    expect(await f.processor.process(state)).toEqual({
      updateId: state.id,
      status: 'PENDING',
      clientSecret: setup.clientSecret,
    });
    expect(f.gateway.createSetup).toHaveBeenCalledWith(state);
    expect(f.repository.save.mock.calls[0][0].snapshot()).toMatchObject({
      stripeSetupIntentId: setup.id,
      status: 'PENDING',
    });
    expect(f.repository.postpone).toHaveBeenCalledWith(state.id, 30);
    expect(f.repository.save.mock.invocationCallOrder[0]).toBeLessThan(
      f.repository.postpone.mock.invocationCallOrder[0],
    );
  });

  it.each(['OWNER_REQUIRED', 'EMAIL_NOT_VERIFIED', 'ORGANIZATION_NOT_FOUND'] as const)(
    'cancels an update whose requesting owner lost authorization: %s',
    async (code) => {
      const f = fixture();
      f.billing.assertOwner.mockRejectedValueOnce(new BillingError(code));

      expect(await f.processor.process(state)).toMatchObject({ status: 'CANCELED', clientSecret: null });
      expect(f.repository.save.mock.calls[0][0].snapshot().status).toBe('CANCELED');
      expect(f.gateway.createSetup).not.toHaveBeenCalled();
      expect(f.billing.customer).not.toHaveBeenCalled();
    },
  );

  it('preserves temporary authorization failures instead of canceling a legitimate update', async () => {
    const f = fixture();
    const failure = new BillingError('BILLING_BUSY');

    f.billing.assertOwner.mockRejectedValueOnce(failure);

    await expect(f.processor.process(state)).rejects.toBe(failure);
    expect(f.repository.save).not.toHaveBeenCalled();
  });

  it('rejects a customer mismatch before contacting Stripe', async () => {
    const f = fixture();
    f.billing.customer.mockResolvedValueOnce({ stripeCustomerId: 'cus_other' });

    await expect(f.processor.process(state)).rejects.toThrow('INVALID_PAYMENT_METHOD_UPDATE');
    expect(f.gateway.createSetup).not.toHaveBeenCalled();
  });

  it('never recreates an uncertain setup after the idempotency retention safety boundary', async () => {
    const f = fixture();
    const old = { ...state, createdAt: new Date(now.getTime() - 23 * 3600000) };

    await expect(f.processor.process(old)).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(f.gateway.createSetup).not.toHaveBeenCalled();

    await f.processor.process({ ...old, stripeSetupIntentId: setup.id });

    expect(f.gateway.retrieveSetup).toHaveBeenCalledWith(setup.id);
    expect(f.gateway.createSetup).not.toHaveBeenCalled();
  });

  it.each([{ customerId: 'cus_other' }, { updateId: 'other' }, { id: 'seti_other' }])(
    'rejects a remote setup identity mismatch: %j',
    async (override) => {
      const f = fixture();
      f.gateway.retrieveSetup.mockResolvedValueOnce({ ...setup, ...override });

      await expect(f.processor.process({ ...state, stripeSetupIntentId: setup.id })).rejects.toThrow(
        'INVALID_PAYMENT_METHOD_UPDATE',
      );
      expect(f.gateway.apply).not.toHaveBeenCalled();
      expect(f.repository.save).not.toHaveBeenCalled();
    },
  );

  it('cancels expired confirmable setups but keeps remotely processing payments pending', async () => {
    const f = fixture();
    const expired: PaymentMethodUpdateProps = { ...state, stripeSetupIntentId: setup.id, expiresAt: now };

    expect(await f.processor.process(expired)).toMatchObject({ status: 'CANCELED', clientSecret: null });
    expect(f.gateway.cancelSetup).toHaveBeenCalledExactlyOnceWith(setup.id);

    f.gateway.retrieveSetup.mockResolvedValueOnce({ ...setup, status: 'processing' });

    expect(await f.processor.process(expired)).toMatchObject({ status: 'PENDING', clientSecret: null });
    expect(f.gateway.cancelSetup).toHaveBeenCalledTimes(1);
    expect(f.repository.postpone).toHaveBeenCalledWith(state.id, 30);
  });

  it('applies a succeeded setup to the exact customer and subscription before marking it applied', async () => {
    const f = fixture();
    f.gateway.retrieveSetup.mockResolvedValueOnce({
      ...setup,
      status: 'succeeded',
      paymentMethodId: 'pm_fixture',
    });

    expect(await f.processor.process({ ...state, stripeSetupIntentId: setup.id })).toEqual({
      updateId: state.id,
      status: 'APPLIED',
      clientSecret: null,
    });
    expect(f.gateway.apply).toHaveBeenCalledExactlyOnceWith({
      customerId: state.stripeCustomerId,
      subscriptionId: state.stripeSubscriptionId,
      updateId: state.id,
      paymentMethodId: 'pm_fixture',
    });
    expect(f.gateway.apply.mock.invocationCallOrder[0]).toBeLessThan(f.repository.save.mock.invocationCallOrder[0]);
    expect(f.repository.postpone).not.toHaveBeenCalled();
  });

  it('rejects succeeded setups without a payment method and preserves pending state on remote apply failure', async () => {
    const f = fixture();
    const attached = { ...state, stripeSetupIntentId: setup.id };

    f.gateway.retrieveSetup.mockResolvedValueOnce({ ...setup, status: 'succeeded' });

    await expect(f.processor.process(attached)).rejects.toThrow('INVALID_PAYMENT_METHOD_UPDATE');
    expect(f.gateway.apply).not.toHaveBeenCalled();

    f.gateway.retrieveSetup.mockResolvedValueOnce({ ...setup, status: 'succeeded', paymentMethodId: 'pm_fixture' });
    f.gateway.apply.mockRejectedValueOnce(new Error('Fixture provider unavailable'));

    await expect(f.processor.process(attached)).rejects.toThrow('Fixture provider unavailable');
    expect(f.repository.save).not.toHaveBeenCalled();
  });
});
