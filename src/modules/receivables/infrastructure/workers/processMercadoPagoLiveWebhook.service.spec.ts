import { describe, expect, it, vi } from 'vitest';

import type { MercadoPagoLiveWebhookRepository } from '../../application/ports/mercadoPagoLiveWebhookRepository.port.js';
import type { LiveWebhookPreparation } from '../../domain/types/mercadoPagoLiveWebhook.types.js';
import type { ClaimedMercadoPagoWebhook } from '../../domain/types/mercadoPagoWebhook.types.js';
import { MercadoPagoError } from '../providers/mercadoPago/mercadoPagoClient.js';
import type { MercadoPagoConnectionRuntime } from '../providers/mercadoPago/mercadoPagoConnectionRuntime.js';
import { ProcessMercadoPagoLiveWebhookService } from './processMercadoPagoLiveWebhook.service.js';

const job: ClaimedMercadoPagoWebhook = {
  clientId: '123',
  deliveryKey: 'delivery',
  paymentId: '456',
  leaseToken: 'lease',
  attempts: 0,
};
const binding = {
  issuanceId: 'issuance',
  organizationId: 'org',
  receivableId: 'receivable',
  receivableVersion: 2,
  ownerId: 'owner',
  clientId: job.clientId,
  accountId: '789',
  paymentId: job.paymentId,
  amountInCents: 1500,
};
const stamp = { connectedAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') };
const ready: LiveWebhookPreparation = { kind: 'READY', binding, stamp, accessToken: 'fixture-token' };

function fixture(options: Record<string, unknown> = {}) {
  const prepare = vi.fn<MercadoPagoLiveWebhookRepository['prepare']>().mockResolvedValue(ready);
  const settle = vi.fn<MercadoPagoLiveWebhookRepository['settle']>().mockResolvedValue(true);
  const readLivePix = vi.fn().mockResolvedValue({ status: 'PENDING' });
  const runtime = { liveMode: true, clientId: job.clientId, client: { readLivePix }, ...options };
  const service = new ProcessMercadoPagoLiveWebhookService(
    { prepare, settle } as unknown as MercadoPagoLiveWebhookRepository,
    runtime as unknown as MercadoPagoConnectionRuntime,
  );

  return { service, prepare, settle, readLivePix };
}

describe('ProcessMercadoPagoLiveWebhookService', () => {
  it.each([{ liveMode: false }, { client: null }, { clientId: 'other' }])(
    'does not contact the provider with unavailable or incompatible credentials: %j',
    async (options) => {
      const f = fixture(options);

      expect(await f.service.execute(job)).toBe(true);
      expect(f.prepare).not.toHaveBeenCalled();
      expect(f.readLivePix).not.toHaveBeenCalled();
      expect(f.settle).toHaveBeenCalledWith(job, { kind: 'RETRY', code: 'CREDENTIAL_UNAVAILABLE' });
    },
  );

  it('preserves preparation retry, review and owner-change outcomes without calling the provider', async () => {
    const f = fixture();
    const outcomes: LiveWebhookPreparation[] = [
      { kind: 'RETRY', code: 'UNMATCHED_PAYMENT' },
      { kind: 'REVIEW', code: 'INVALID_BINDING' },
      { kind: 'OWNER_CHANGED', binding },
    ];

    for (const outcome of outcomes) {
      f.prepare.mockResolvedValueOnce(outcome);
      await f.service.execute(job);

      expect(f.settle).toHaveBeenLastCalledWith(job, outcome);
    }

    expect(f.readLivePix).not.toHaveBeenCalled();
  });

  it('refuses mismatched payment or client binding before reading provider state', async () => {
    const f = fixture();
    f.prepare.mockResolvedValueOnce({ ...ready, binding: { ...binding, paymentId: 'other' } });
    f.prepare.mockResolvedValueOnce({ ...ready, binding: { ...binding, clientId: 'other' } });

    await f.service.execute(job);
    await f.service.execute(job);

    expect(f.readLivePix).not.toHaveBeenCalled();
    expect(f.settle).toHaveBeenNthCalledWith(1, job, { kind: 'REVIEW', code: 'INVALID_BINDING' });
    expect(f.settle).toHaveBeenNthCalledWith(2, job, { kind: 'REVIEW', code: 'INVALID_BINDING' });
  });

  it('uses the immutable local payment binding and propagates the durable settlement result', async () => {
    const f = fixture();
    f.settle.mockResolvedValueOnce(false);

    expect(await f.service.execute(job)).toBe(false);
    expect(f.readLivePix).toHaveBeenCalledWith({
      issuanceId: binding.issuanceId,
      accountId: binding.accountId,
      paymentId: binding.paymentId,
      amountInCents: binding.amountInCents,
      accessToken: 'fixture-token',
      eventId: job.deliveryKey,
    });
    expect(f.settle).toHaveBeenCalledWith(job, { kind: 'CHECKED', binding, stamp, observation: { status: 'PENDING' } });
  });

  it('distinguishes invalid provider identity from temporary network errors', async () => {
    const f = fixture();
    f.readLivePix.mockRejectedValueOnce(new MercadoPagoError('ACCOUNT_MISMATCH'))
      .mockRejectedValueOnce(new MercadoPagoError('REQUEST_FAILED'));

    await f.service.execute(job);
    await f.service.execute(job);

    expect(f.settle).toHaveBeenNthCalledWith(1, job, { kind: 'CHECKED', binding, stamp, observation: { status: 'INVALID_PROVIDER_PAYMENT' } });
    expect(f.settle).toHaveBeenNthCalledWith(2, job, { kind: 'RETRY', code: 'PROVIDER_UNAVAILABLE' });
  });

  it('turns unexpected preparation failures into a sanitized durable retry', async () => {
    const f = fixture();
    f.prepare.mockRejectedValueOnce(new Error('private database contents'));

    await f.service.execute(job);

    expect(f.settle).toHaveBeenCalledWith(job, { kind: 'RETRY', code: 'PROCESSING_FAILED' });
  });
});
