import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { BillingWork } from '../events/billing.events.js';
import type { BillingWorkerNotifier } from '../events/billingWorkerNotifier.service.js';

import { PrismaBillingWebhookRepository } from './prismaBillingWebhook.repository.js';

const event = {
  id: 'evt_fixture',
  type: 'invoice.paid',
  stripeCustomerId: 'cus_fixture',
  stripeObjectId: 'in_fixture',
  attempts: 0,
  receivedAt: new Date('2026-01-01T00:00:00Z'),
  leaseToken: 'fixture-lease',
};
const notice = {
  id: event.id,
  type: event.type,
  stripeCustomerId: event.stripeCustomerId,
  stripeObjectId: event.stripeObjectId,
};

function fixture() {
  const createMany = vi.fn().mockResolvedValue({ count: 1 });
  const query = vi.fn().mockResolvedValue([]);
  const execute = vi.fn().mockResolvedValue(1);
  const notify = vi.fn();
  const repository = new PrismaBillingWebhookRepository(
    {
      stripeWebhookEvent: { createMany },
      $queryRaw: query,
      $executeRaw: execute,
    } as unknown as PrismaService,
    { notify } as unknown as BillingWorkerNotifier,
  );

  return { repository, createMany, query, execute, notify };
}

describe('PrismaBillingWebhookRepository', () => {
  it('deduplicates provider event IDs and wakes the worker only for new notices', async () => {
    const f = fixture();

    await f.repository.enqueue(notice);
    f.createMany.mockResolvedValueOnce({ count: 0 });
    await f.repository.enqueue(notice);

    expect(f.createMany).toHaveBeenCalledWith({ data: [notice], skipDuplicates: true });
    expect(f.notify).toHaveBeenCalledExactlyOnceWith(BillingWork.WEBHOOKS);
  });

  it('claims a due event with a bounded lease and skips locked or terminal jobs', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([event]);

    expect(await f.repository.claimEvent(event.leaseToken)).toEqual(event);
    expect(await f.repository.claimEvent(event.leaseToken)).toBeNull();

    const [parts, token] = f.query.mock.calls[0]!;
    const sql = parts.join('?');

    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('"processedAt" IS NULL');
    expect(sql).toContain('"failedAt" IS NULL');
    expect(sql).toContain('"leaseExpiresAt" <= CURRENT_TIMESTAMP');
    expect(token).toBe(event.leaseToken);
  });

  it('renews leases only for the still-valid owner of unprocessed work', async () => {
    const f = fixture();
    f.execute.mockResolvedValueOnce(0);

    expect(await f.repository.renewEventLease(event)).toBe(false);
    expect(await f.repository.renewEventLease(event)).toBe(true);

    const [parts, id, token] = f.execute.mock.calls[0]!;

    expect(parts.join('?')).toContain('"leaseExpiresAt" > CURRENT_TIMESTAMP');
    expect(id).toBe(event.id);
    expect(token).toBe(event.leaseToken);
  });

  it.each(['COMPLETE', 'DEFER', 'RETRY'] as const)('settles %s only under the current lease', async (outcome) => {
    const f = fixture();

    expect(await f.repository.settleEvent(event, outcome)).toBe(true);
    f.execute.mockResolvedValueOnce(0);
    expect(await f.repository.settleEvent(event, outcome)).toBe(false);

    const [parts, changes, id, token] = f.execute.mock.calls[0]!;

    expect(parts.join('?')).toContain('"leaseToken" = NULL');
    expect(parts.join('?')).toContain('"leaseExpiresAt" > CURRENT_TIMESTAMP');
    expect(id).toBe(event.id);
    expect(token).toBe(event.leaseToken);
    if (outcome === 'COMPLETE') {
      expect(changes.sql).toContain('"processedAt" = CURRENT_TIMESTAMP');
    }
    if (outcome === 'DEFER') {
      expect(changes.sql).toContain("INTERVAL '15 seconds'");
    }
    if (outcome === 'RETRY') {
      expect(changes.sql).toContain('"attempts" = "attempts" + 1');
    }
  });

  it('caps retry delay and error length while retaining the terminal retry threshold', async () => {
    const f = fixture();

    await f.repository.settleEvent({ ...event, attempts: 24 }, 'RETRY', 'x'.repeat(150));

    const changes = f.execute.mock.calls[0]![1];

    expect(changes.values).toEqual(['x'.repeat(100), 3600]);
    expect(changes.sql).toContain('"attempts" + 1 >= 25');
  });
});
