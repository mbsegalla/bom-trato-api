import { describe, expect, it, vi } from 'vitest';

import type { MercadoPagoWebhookRepository } from '../../application/ports/mercadoPagoWebhookRepository.port.js';
import {
  mercadoPagoWebhookDisposition,
  mercadoPagoWebhookRetryDelaySeconds,
} from '../../domain/policies/mercadoPagoWebhookRetry.policy.js';
import type {
  ClaimedMercadoPagoWebhook,
  SandboxPixWebhookBinding,
} from '../../domain/types/mercadoPagoWebhook.types.js';
import { MercadoPagoError } from '../providers/mercadoPago/mercadoPagoClient.js';
import type { MercadoPagoConnectionRuntime } from '../providers/mercadoPago/mercadoPagoConnectionRuntime.js';

import { ProcessMercadoPagoWebhookService } from './processMercadoPagoWebhook.service.js';

const job: ClaimedMercadoPagoWebhook = {
  clientId: '123',
  deliveryKey: 'delivery',
  paymentId: '456',
  leaseToken: 'lease',
  attempts: 0,
};
const binding: SandboxPixWebhookBinding = {
  issuanceId: '4586a4c1-924c-4a48-9949-a837e7540c2c',
  organizationId: 'organization',
  ownerId: 'owner',
  clientId: '123',
  accountId: '789',
  paymentId: '456',
  amountInCents: 10000,
};
const connectedAt = new Date('2026-11-25T15:00:00Z');

function fixture(liveMode = false) {
  const readSandboxPix = vi.fn().mockResolvedValue('APPROVED');
  const repository = {
    prepare: vi.fn().mockResolvedValue({
      kind: 'READY',
      access: {
        binding,
        connectedAt,
        accessToken: 'fixture-access',
      },
    }),
    settle: vi.fn().mockResolvedValue(true),
  };
  const runtime = { client: { readSandboxPix }, liveMode, clientId: job.clientId };

  return {
    readSandboxPix,
    repository,
    processor: new ProcessMercadoPagoWebhookService(
      repository as unknown as MercadoPagoWebhookRepository,
      runtime as unknown as MercadoPagoConnectionRuntime,
    ),
  };
}

describe('sandbox webhook processing', () => {
  it('only checks an authoritative, durably bound payment and forwards no credentials to settlement', async () => {
    const { processor, repository, readSandboxPix } = fixture();

    expect(await processor.execute(job)).toBe(true);
    expect(readSandboxPix).toHaveBeenCalledWith({
      issuanceId: binding.issuanceId,
      accountId: binding.accountId,
      paymentId: binding.paymentId,
      amountInCents: binding.amountInCents,
      accessToken: 'fixture-access',
    });
    expect(repository.settle).toHaveBeenCalledWith(job, {
      kind: 'CHECKED',
      binding,
      connectedAt,
      status: 'APPROVED',
    });
  });

  it.each([
    { kind: 'RETRY', code: 'UNMATCHED_PAYMENT' },
    { kind: 'RETRY', code: 'CREDENTIAL_UNAVAILABLE' },
    { kind: 'REVIEW', code: 'AMBIGUOUS_PAYMENT' },
  ])('retains unavailable bindings without provider calls: %j', async (result) => {
    const { processor, repository, readSandboxPix } = fixture();
    repository.prepare.mockResolvedValueOnce(result);

    await processor.execute(job);

    expect(readSandboxPix).not.toHaveBeenCalled();
    expect(repository.settle).toHaveBeenCalledWith(job, result);
  });

  it('never processes live notifications or consults live credentials', async () => {
    const { processor, repository, readSandboxPix } = fixture(true);

    await processor.execute(job);

    expect(repository.prepare).not.toHaveBeenCalled();
    expect(readSandboxPix).not.toHaveBeenCalled();
    expect(repository.settle).toHaveBeenCalledWith(job, { kind: 'RETRY', code: 'CREDENTIAL_UNAVAILABLE' });
  });

  it('retries transport errors and holds inconsistent provider responses for review', async () => {
    const { processor, repository, readSandboxPix } = fixture();
    readSandboxPix.mockRejectedValueOnce(new MercadoPagoError('REQUEST_FAILED', 503));

    await processor.execute(job);

    expect(repository.settle).toHaveBeenLastCalledWith(job, { kind: 'RETRY', code: 'PROVIDER_UNAVAILABLE' });

    readSandboxPix.mockRejectedValueOnce(new MercadoPagoError('ACCOUNT_MISMATCH'));

    await processor.execute(job);

    expect(repository.settle).toHaveBeenLastCalledWith(job, { kind: 'REVIEW', code: 'INVALID_PROVIDER_PAYMENT' });
  });

  it('reports a lost lease without claiming successful processing', async () => {
    const { processor, repository } = fixture();
    repository.settle.mockResolvedValueOnce(false);

    expect(await processor.execute(job)).toBe(false);
  });
});

describe('sandbox webhook retry disposition', () => {
  it('retries unmatched events with bounded exponential backoff and retains exhausted events', () => {
    const outcome = { kind: 'RETRY', code: 'UNMATCHED_PAYMENT' } as const;

    expect(mercadoPagoWebhookDisposition(outcome, 0)).toMatchObject({ complete: false, review: false });
    expect(mercadoPagoWebhookDisposition(outcome, 24)).toMatchObject({ complete: false, review: true });
    expect(mercadoPagoWebhookRetryDelaySeconds(0)).toBe(30);
    expect(mercadoPagoWebhookRetryDelaySeconds(2)).toBe(120);
    expect(mercadoPagoWebhookRetryDelaySeconds(100)).toBe(3600);
  });

  it('keeps a verified refund and uncertain status in review', () => {
    const checked = { kind: 'CHECKED', binding, connectedAt } as const;

    expect(mercadoPagoWebhookDisposition({ ...checked, status: 'APPROVED' }, 0)).toMatchObject({
      complete: true,
      review: false,
      code: 'VERIFIED_APPROVED',
    });
    expect(mercadoPagoWebhookDisposition({ ...checked, status: 'REFUNDED' }, 0)).toMatchObject({
      complete: false,
      review: true,
      code: 'VERIFIED_REFUNDED',
    });
    expect(
      mercadoPagoWebhookDisposition(
        {
          ...checked,
          status: 'REVIEW_REQUIRED',
        },
        0,
      ),
    ).toMatchObject({ complete: false, review: true });
  });
});
