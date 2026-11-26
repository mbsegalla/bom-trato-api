import type { ConfigType } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { notificationConfig } from '../../../../config/notification.config.js';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { NotificationJob, NotificationMessage } from '../../application/types/notification.types.js';
import { NotificationDeliveryError, type ResendEmailGateway } from '../resend/resendEmail.gateway.js';
import type { NotificationCipher } from '../security/notificationCipher.js';

import { NotificationWorker } from './notification.worker.js';

const now = new Date('2026-01-01T12:00:00Z');
const job: NotificationJob = {
  id: 'notification',
  key: 'verify/fixture',
  type: 'VERIFY_EMAIL',
  encryptedPayload: 'encrypted',
  leaseToken: 'fixture-lease',
  attempts: 1,
  expiresAt: new Date(now.getTime() + 3600000),
  firstAttemptAt: now,
  organizationId: null,
  automationType: null,
  automationEntityId: null,
  automationContextId: null,
  automationReferenceAt: null,
};
const message: NotificationMessage = {
  from: 'sender@example.invalid',
  to: 'recipient@example.invalid',
  template: { id: 'fixture', variables: { ACTION_URL: 'https://example.invalid/#token=fixture' } },
};
const lease = { id: job.id, status: 'PROCESSING', leaseToken: job.leaseToken };

function fixture(enabled = true, candidate: NotificationJob = job) {
  const query = vi.fn().mockResolvedValue([]).mockResolvedValueOnce([candidate]);
  const execute = vi.fn().mockResolvedValue(1);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const decrypt = vi.fn().mockReturnValue(message);
  const send = vi.fn().mockResolvedValue('provider-id');
  const worker = new NotificationWorker(
    { workerEnabled: enabled, trialLifecycleEnabled: false } as ConfigType<typeof notificationConfig>,
    { $queryRaw: query, $executeRaw: execute, notificationOutbox: { updateMany } } as unknown as PrismaService,
    { decrypt } as unknown as NotificationCipher,
    { send } as unknown as ResendEmailGateway,
  );

  return { worker, query, execute, updateMany, decrypt, send };
}

async function processOnce(worker: NotificationWorker) {
  worker.onApplicationBootstrap();
  await vi.advanceTimersByTimeAsync(0);
}

describe('NotificationWorker', () => {
  let worker: NotificationWorker | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(async () => {
    try {
      await worker?.onModuleDestroy();
    } finally {
      worker = undefined;
      vi.useRealTimers();
    }
  });

  it('does not claim or clean up jobs while disabled', async () => {
    const f = fixture(false);
    worker = f.worker;

    await processOnce(worker);
    worker.handleNotificationsAvailable();
    worker.recover();
    await worker.cleanup();

    expect(f.query).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });

  it('claims work with a bounded lease, sends once and erases the encrypted payload on acceptance', async () => {
    const f = fixture();
    worker = f.worker;

    await processOnce(worker);

    expect(f.query.mock.calls[0]![0].join('?')).toContain('FOR UPDATE SKIP LOCKED');
    expect(f.query.mock.calls[0]![0].join('?')).toContain("INTERVAL '2 minutes'");
    expect(f.decrypt).toHaveBeenCalledWith(job.id, job.encryptedPayload);
    expect(f.send).toHaveBeenCalledExactlyOnceWith(job.id, message);
    expect(f.updateMany).toHaveBeenCalledWith({
      where: lease,
      data: {
        status: 'ACCEPTED',
        providerId: 'provider-id',
        encryptedPayload: null,
        finishedAt: now,
        leaseToken: null,
        leaseUntil: null,
        lastErrorCode: null,
      },
    });
  });

  it.each([
    [{ ...job, expiresAt: now }, 'RETRY_WINDOW_EXPIRED'],
    [{ ...job, attempts: 17 }, 'RETRY_WINDOW_EXPIRED'],
    [{ ...job, firstAttemptAt: new Date(now.getTime() - 23 * 3600000) }, 'RETRY_WINDOW_EXPIRED'],
    [{ ...job, type: 'TRIAL_LIFECYCLE' }, 'TRIAL_LIFECYCLE_NO_LONGER_APPLICABLE'],
  ] as const)('skips expired or disabled work: %s', async (candidate, code) => {
    const f = fixture(true, candidate);
    worker = f.worker;

    await processOnce(worker);

    expect(f.send).not.toHaveBeenCalled();
    expect(f.updateMany).toHaveBeenCalledWith({
      where: lease,
      data: expect.objectContaining({ status: 'SKIPPED', lastErrorCode: code, encryptedPayload: null }),
    });
  });

  it('permanently fails malformed or missing encrypted payloads without attempting delivery', async () => {
    const f = fixture(true, { ...job, encryptedPayload: null });
    worker = f.worker;

    await processOnce(worker);

    expect(f.decrypt).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
    expect(f.updateMany).toHaveBeenCalledWith({
      where: lease,
      data: expect.objectContaining({
        status: 'FAILED',
        lastErrorCode: 'INVALID_ENCRYPTED_PAYLOAD',
        encryptedPayload: null,
      }),
    });
  });

  it('honors provider retry-after and retains encrypted content for retryable failures', async () => {
    const f = fixture();
    worker = f.worker;
    f.send.mockRejectedValueOnce(new NotificationDeliveryError('RESEND_HTTP_429', true, 120));

    await processOnce(worker);

    expect(f.updateMany).toHaveBeenCalledWith({
      where: lease,
      data: {
        status: 'PENDING',
        availableAt: new Date(now.getTime() + 120000),
        leaseToken: null,
        leaseUntil: null,
        lastErrorCode: 'RESEND_HTTP_429',
      },
    });
  });

  it.each([
    [job, new NotificationDeliveryError('RESEND_IDEMPOTENCY_CONFLICT', false), 'RESEND_IDEMPOTENCY_CONFLICT'],
    [{ ...job, attempts: 16 }, new Error('private provider detail'), 'PROVIDER_UNAVAILABLE'],
    [
      { ...job, expiresAt: new Date(now.getTime() + 30000) },
      new Error('private provider detail'),
      'PROVIDER_UNAVAILABLE',
    ],
  ] as const)(
    'ends permanent failures, exhausted retries and retries beyond expiry: %s',
    async (candidate, failure, code) => {
      const f = fixture(true, candidate);
      worker = f.worker;
      f.send.mockRejectedValueOnce(failure);

      await processOnce(worker);

      expect(f.updateMany).toHaveBeenCalledWith({
        where: lease,
        data: expect.objectContaining({ status: 'FAILED', lastErrorCode: code, encryptedPayload: null }),
      });
    },
  );

  it('recovers a failed claim only on a new wake and stops scheduling after shutdown', async () => {
    const f = fixture();
    worker = f.worker;
    f.query
      .mockReset()
      .mockRejectedValueOnce(new Error('Fixture database failure'))
      .mockResolvedValueOnce([job])
      .mockResolvedValue([]);

    await processOnce(worker);
    await vi.advanceTimersByTimeAsync(5000);

    expect(f.query).toHaveBeenCalledTimes(1);

    worker.recover();
    await vi.advanceTimersByTimeAsync(0);

    expect(f.send).toHaveBeenCalledTimes(1);
    await worker.onModuleDestroy();
    worker.recover();
    await vi.advanceTimersByTimeAsync(60000);

    expect(f.query).toHaveBeenCalledTimes(2);
  });

  it('cleans only old finished jobs in bounded batches', async () => {
    const f = fixture();
    worker = f.worker;

    await processOnce(worker);
    await worker.cleanup();

    const sql = f.execute.mock.calls[0]![0].join('?');

    expect(sql).toContain("INTERVAL '90 days'");
    expect(sql).toContain('LIMIT 1000');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
  });
});
