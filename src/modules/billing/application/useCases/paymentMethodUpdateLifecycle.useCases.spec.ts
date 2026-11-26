import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PaymentMethodUpdate } from '../../domain/entities/paymentMethodUpdate.entity.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { PaymentMethodUpdateRepository } from '../../domain/repositories/paymentMethodUpdate.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';
import type { PaymentMethodUpdateProcessor } from '../services/paymentMethodUpdateProcessor.service.js';

import { CompletePaymentMethodUpdateUseCase } from './completePaymentMethodUpdate.useCase.js';
import { StartPaymentMethodUpdateUseCase } from './startPaymentMethodUpdate.useCase.js';
import { SyncPaymentMethodUpdateUseCase } from './syncPaymentMethodUpdate.useCase.js';

const now = new Date('2026-01-01T12:00:00Z');
const actor = { organizationId: 'org', userId: 'owner' };
const state = PaymentMethodUpdate.create({
  id: 'update',
  organizationId: actor.organizationId,
  requestedById: actor.userId,
  stripeCustomerId: 'cus_fixture',
  stripeSubscriptionId: 'sub_fixture',
  consentVersion: 'subscription-card-v1',
  consentAcceptedAt: now,
  expiresAt: new Date(now.getTime() + 7200000),
}).snapshot();
const active = { ...state, stripeSetupIntentId: 'seti_fixture' };
const result = { updateId: state.id, status: 'PENDING', clientSecret: 'fixture-secret' };

function fixture() {
  const billing = {
    assertOwner: vi.fn().mockResolvedValue(undefined),
    customer: vi.fn().mockResolvedValue({ stripeCustomerId: state.stripeCustomerId }),
    saveSnapshot: vi.fn().mockResolvedValue(undefined),
    currentSubscription: vi
      .fn()
      .mockResolvedValue({ status: 'ACTIVE', stripeSubscriptionId: state.stripeSubscriptionId }),
  };
  const repository = {
    active: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue(active),
    save: vi.fn(async (entity: PaymentMethodUpdate) => entity.snapshot()),
    create: vi.fn(async (entity: PaymentMethodUpdate) => entity.snapshot()),
  };
  const gateway = { snapshot: vi.fn().mockResolvedValue({ subscriptions: [], invoices: [] }) };
  const lock = { run: vi.fn(async (_key: string, operation: () => Promise<unknown>) => operation()) };
  const processor = { process: vi.fn().mockResolvedValue(result) };
  const b = billing as unknown as BillingRepository;
  const r = repository as unknown as PaymentMethodUpdateRepository;
  const l = lock as unknown as BillingLock;
  const p = processor as unknown as PaymentMethodUpdateProcessor;

  return {
    billing,
    repository,
    gateway,
    lock,
    processor,
    start: new StartPaymentMethodUpdateUseCase(b, r, gateway as unknown as BillingGateway, l, p),
    complete: new CompletePaymentMethodUpdateUseCase(b, r, l, p),
    sync: new SyncPaymentMethodUpdateUseCase(r, l, p),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => vi.useRealTimers());

describe('payment method update lifecycle', () => {
  it('rechecks ownership under the lock and persists consent before processing the new setup', async () => {
    const f = fixture();

    expect(await f.start.execute(actor)).toEqual(result);
    expect(f.billing.assertOwner).toHaveBeenCalledTimes(2);
    expect(f.lock.run).toHaveBeenCalledWith('organization:org', expect.any(Function));
    expect(f.gateway.snapshot).toHaveBeenCalledWith(state.stripeCustomerId);

    const stored = f.repository.create.mock.calls[0][0].snapshot();

    expect(stored).toMatchObject({
      organizationId: actor.organizationId,
      requestedById: actor.userId,
      stripeCustomerId: state.stripeCustomerId,
      stripeSubscriptionId: state.stripeSubscriptionId,
      status: 'PENDING',
      consentVersion: 'subscription-card-v1',
      consentAcceptedAt: now,
      expiresAt: new Date(now.getTime() + 7200000),
    });
    expect(f.processor.process).toHaveBeenCalledWith(stored);
    expect(f.billing.saveSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      f.repository.create.mock.invocationCallOrder[0],
    );
  });

  it('resumes the same owner setup without creating a second update', async () => {
    const f = fixture();
    f.repository.active.mockResolvedValueOnce(active);

    expect(await f.start.execute(actor)).toEqual(result);
    expect(f.processor.process).toHaveBeenCalledWith(active);
    expect(f.repository.create).not.toHaveBeenCalled();
    expect(f.gateway.snapshot).not.toHaveBeenCalled();
  });

  it('cancels an earlier owner update before creating a replacement', async () => {
    const f = fixture();
    f.repository.active.mockResolvedValueOnce({ ...active, requestedById: 'former-owner' });

    await f.start.execute(actor);

    expect(f.repository.save.mock.calls[0][0].snapshot().status).toBe('CANCELED');
    expect(f.repository.save.mock.invocationCallOrder[0]).toBeLessThan(f.repository.create.mock.invocationCallOrder[0]);
  });

  it('stops if authorization changes while waiting for the organization lock', async () => {
    const f = fixture();
    f.billing.assertOwner.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new BillingError('OWNER_REQUIRED'));

    await expect(f.start.execute(actor)).rejects.toThrow('OWNER_REQUIRED');
    expect(f.repository.active).not.toHaveBeenCalled();
    expect(f.repository.create).not.toHaveBeenCalled();
  });

  it.each([
    { status: null, code: 'SUBSCRIPTION_NOT_FOUND' },
    { status: 'CANCELED', code: 'INVALID_SUBSCRIPTION_STATE' },
    { status: 'INCOMPLETE', code: 'INVALID_SUBSCRIPTION_STATE' },
  ])('rejects a subscription that cannot update its payment method: $status', async ({ status, code }) => {
    const f = fixture();
    f.billing.currentSubscription.mockResolvedValueOnce(status === null ? null : { status });

    await expect(f.start.execute(actor)).rejects.toThrow(code);
    expect(f.repository.create).not.toHaveBeenCalled();
    expect(f.processor.process).not.toHaveBeenCalled();
  });

  it('returns no client secret from explicit completion and rejects foreign or missing updates', async () => {
    const f = fixture();
    const params = { ...actor, updateId: active.id };

    expect(await f.complete.execute(params)).toEqual({ ...result, clientSecret: null });
    expect(f.processor.process).toHaveBeenCalledWith(active);

    f.repository.find.mockResolvedValueOnce({ ...active, organizationId: 'other' }).mockResolvedValueOnce(null);

    await expect(f.complete.execute(params)).rejects.toThrow('PAYMENT_METHOD_UPDATE_NOT_FOUND');
    await expect(f.complete.execute(params)).rejects.toThrow('PAYMENT_METHOD_UPDATE_NOT_FOUND');
    expect(f.processor.process).toHaveBeenCalledTimes(1);
  });

  it('syncs only pending updates whose tenant and optional provider identity match', async () => {
    const f = fixture();
    const params = { organizationId: actor.organizationId, updateId: active.id };

    for (const stored of [null, { ...active, organizationId: 'other' }, { ...active, status: 'APPLIED' }]) {
      f.repository.find.mockResolvedValueOnce(stored);

      await f.sync.execute(params);
    }

    await f.sync.execute({ ...params, setupIntentId: 'seti_other' });
    expect(f.processor.process).not.toHaveBeenCalled();

    await f.sync.execute({ ...params, setupIntentId: active.stripeSetupIntentId });
    expect(f.processor.process).toHaveBeenCalledExactlyOnceWith(active);

    f.repository.active.mockResolvedValueOnce(active);
    await f.sync.execute({ organizationId: actor.organizationId });
    expect(f.repository.active).toHaveBeenCalledWith(actor.organizationId);
    expect(f.processor.process).toHaveBeenCalledTimes(2);
  });
});
