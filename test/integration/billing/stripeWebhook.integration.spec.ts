import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../../src/infrastructure/database/prisma.service.js';
import { BillingWork } from '../../../src/modules/billing/infrastructure/events/billing.events.js';
import type { BillingWorkerNotifier } from '../../../src/modules/billing/infrastructure/events/billingWorkerNotifier.service.js';
import { PrismaBillingWebhookRepository } from '../../../src/modules/billing/infrastructure/repositories/prismaBillingWebhook.repository.js';
import { asymmetric } from '../../support/asymmetricMatchers.js';

const url = process.env.PAYMENT_INTEGRATION_DATABASE_URL;
const suite = url === undefined ? describe.skip : describe;
function disposableUrl(): string {
  if (!url) {
    throw new Error('Missing disposable integration database URL');
  }
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.pathname !== '/bom_trato_ci' ||
    parsed.username !== 'bom_trato_ci' ||
    parsed.searchParams.get('schema') !== 'public'
  ) {
    throw new Error('Stripe inbox tests require the disposable local bom_trato_ci database');
  }
  return url;
}
suite('Stripe durable webhook inbox (disposable PostgreSQL)', () => {
  let prisma: PrismaService;
  let repository: PrismaBillingWebhookRepository;
  const notify = vi.fn();
  const ids: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService({ url: disposableUrl() });

    await prisma.$connect();
    repository = new PrismaBillingWebhookRepository(prisma, { notify } as unknown as BillingWorkerNotifier);
  });

  afterEach(async () => {
    if (prisma) {
      await prisma.stripeWebhookEvent.deleteMany({ where: { id: { in: ids.splice(0) } } });
    }
    notify.mockClear();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });
  function notice() {
    const id = 'evt_fixture_' + randomUUID();
    ids.push(id);

    return {
      id,
      type: 'invoice.paid',
      stripeCustomerId: 'cus_fixture',
      stripeObjectId: 'in_fixture',
    };
  }

  it('deduplicates deliveries and leases an event to only one worker', async () => {
    const event = notice();

    await Promise.all([repository.enqueue(event), repository.enqueue(event)]);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(BillingWork.WEBHOOKS);

    const claims = await Promise.all([repository.claimEvent(randomUUID()), repository.claimEvent(randomUUID())]);
    const claimed = claims.find((claim) => claim !== null);
    if (!claimed) {
      throw new Error('Fixture claim missing');
    }

    expect(claimed.id).toBe(event.id);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await repository.settleEvent(claimed, 'COMPLETE')).toBe(true);
    expect(await repository.settleEvent(claimed, 'COMPLETE')).toBe(false);
    expect(await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({
      processedAt: asymmetric.any(Date),
      attempts: 0,
      leaseToken: null,
      failedAt: null,
    });
  });

  it('reclaims an expired lease, rejects the stale worker and retains the retry reason', async () => {
    const event = notice();

    await repository.enqueue(event);
    const first = await repository.claimEvent(randomUUID());
    if (!first) {
      throw new Error('Fixture claim missing');
    }

    expect(first.id).toBe(event.id);

    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: {
        receivedAt: new Date(Date.now() - 180000),
        leaseExpiresAt: new Date(Date.now() - 1000),
      },
    });
    const second = await repository.claimEvent(randomUUID());
    if (!second) {
      throw new Error('Fixture reclaim missing');
    }

    expect(second.id).toBe(event.id);
    expect(await repository.renewEventLease(first)).toBe(false);
    expect(await repository.settleEvent(first, 'COMPLETE')).toBe(false);
    expect(await repository.settleEvent(second, 'RETRY', 'FIXTURE_RETRY')).toBe(true);

    const row = await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: event.id } });

    expect(row).toMatchObject({
      attempts: 1,
      lastErrorCode: 'FIXTURE_RETRY',
      failedAt: null,
      processedAt: null,
      leaseToken: null,
    });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('preserves exhausted events for review instead of processing them again', async () => {
    const event = notice();

    await repository.enqueue(event);
    await prisma.stripeWebhookEvent.update({ where: { id: event.id }, data: { attempts: 24 } });
    const job = await repository.claimEvent(randomUUID());
    if (!job) {
      throw new Error('Fixture claim missing');
    }

    expect(job.id).toBe(event.id);
    expect(await repository.settleEvent(job, 'RETRY', 'FIXTURE_EXHAUSTED')).toBe(true);
    expect(await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({
      attempts: 25,
      failedAt: asymmetric.any(Date),
      processedAt: null,
      lastErrorCode: 'FIXTURE_EXHAUSTED',
    });
    expect(await repository.claimEvent(randomUUID())).toBeNull();
  });
  it('defers an event without consuming a retry and allows it to be claimed again when due', async () => {
    const event = notice();

    await repository.enqueue(event);
    const first = await repository.claimEvent(randomUUID());
    if (!first) {
      throw new Error('Fixture claim missing');
    }

    expect(first.id).toBe(event.id);
    expect(await repository.settleEvent(first, 'DEFER')).toBe(true);
    expect(await repository.claimEvent(randomUUID())).toBeNull();

    const row = await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: event.id } });

    expect(row).toMatchObject({ attempts: 0, leaseToken: null, leaseExpiresAt: null, processedAt: null });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    const second = await repository.claimEvent(randomUUID());
    if (!second) {
      throw new Error('Fixture reclaim missing');
    }

    expect(second.id).toBe(event.id);
    expect(second.leaseToken).not.toBe(first.leaseToken);
    expect(await repository.settleEvent(first, 'COMPLETE')).toBe(false);
    expect(await repository.settleEvent(second, 'COMPLETE')).toBe(true);
  });

  it('renews a valid lease and prevents redelivery after completion', async () => {
    const event = notice();

    await repository.enqueue(event);
    const job = await repository.claimEvent(randomUUID());
    if (!job) {
      throw new Error('Fixture claim missing');
    }

    expect(job.id).toBe(event.id);
    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: { leaseExpiresAt: new Date(Date.now() + 30000) },
    });
    expect(await repository.renewEventLease(job)).toBe(true);

    const renewed = await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: event.id } });

    expect(renewed.leaseExpiresAt?.getTime()).toBeGreaterThan(Date.now() + 30000);
    expect(await repository.claimEvent(randomUUID())).toBeNull();
    expect(await repository.settleEvent(job, 'COMPLETE')).toBe(true);
    expect(await repository.renewEventLease(job)).toBe(false);

    await repository.enqueue(event);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(await repository.claimEvent(randomUUID())).toBeNull();
  });
});
