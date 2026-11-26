import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readTrialLifecycleNotification } from '../policies/prismaTrialLifecycle.policy.js';
import { TrialLifecycleWorker } from './trialLifecycle.worker.js';

vi.mock('../policies/prismaTrialLifecycle.policy.js', () => ({ readTrialLifecycleNotification: vi.fn() }));

const read = vi.mocked(readTrialLifecycleNotification);
const notification = { key: 'fixture-key', recipient: 'fixture@example.invalid' } as unknown as NonNullable<Awaited<ReturnType<typeof readTrialLifecycleNotification>>>;

function fixture(workerEnabled = true, trialLifecycleEnabled = true) {
  const findMany = vi.fn().mockResolvedValue([]);
  const findUnique = vi.fn().mockResolvedValue(null);
  const execute = vi.fn().mockResolvedValue(0);
  const db = { organizationTrial: { findMany }, notificationOutbox: { findUnique }, $executeRaw: execute };
  const transaction = vi.fn(async (operation: (client: typeof db) => Promise<unknown>) => operation(db));
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const args = [
    { workerEnabled, trialLifecycleEnabled }, { ...db, $transaction: transaction }, { enqueue },
  ] as unknown as ConstructorParameters<typeof TrialLifecycleWorker>;
  const worker = new TrialLifecycleWorker(...args);

  return { worker, findMany, findUnique, transaction, enqueue };
}

describe('TrialLifecycleWorker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    read.mockResolvedValue(notification);
  });

  it.each([[false, true], [true, false], [false, false]])('does not query when workers are disabled', async (enabled, lifecycle) => {
    const f = fixture(enabled, lifecycle);
    await f.worker.run();
    expect(f.findMany).not.toHaveBeenCalled();
  });

  it('queries only active or recently expired eligible trial candidates', async () => {
    const f = fixture();
    await f.worker.run();

    expect(f.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        convertedAt: null, revokedAt: null, organizationId: { not: null },
        startsAt: { lte: expect.any(Date) }, expiresAt: { gt: expect.any(Date) },
        owner: { disabledAt: null, emailVerifiedAt: { not: null } },
      }),
      take: 100, orderBy: { id: 'asc' },
    }));
    expect(f.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues eligible notifications after revalidation in a read transaction', async () => {
    const f = fixture();
    f.findMany.mockResolvedValueOnce([{ id: 'trial' }]);
    await f.worker.run();

    expect(read).toHaveBeenCalledWith(expect.anything(), 'trial', expect.any(Date));
    expect(f.findUnique).toHaveBeenCalledWith({ where: { key: notification.key }, select: { id: true } });
    expect(f.enqueue).toHaveBeenCalledExactlyOnceWith(notification);
  });

  it('skips trials that became ineligible', async () => {
    const f = fixture();
    f.findMany.mockResolvedValueOnce([{ id: 'trial' }]);
    read.mockResolvedValue(null);
    await f.worker.run();

    expect(f.findUnique).not.toHaveBeenCalled();
    expect(f.enqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue a duplicate notification', async () => {
    const f = fixture();
    f.findMany.mockResolvedValueOnce([{ id: 'trial' }]);
    f.findUnique.mockResolvedValue({ id: 'existing' });
    await f.worker.run();

    expect(f.enqueue).not.toHaveBeenCalled();
  });

  it('continues processing other trials after an isolated enqueue failure', async () => {
    const f = fixture();
    f.findMany.mockResolvedValueOnce([{ id: 'one' }, { id: 'two' }]);
    f.enqueue.mockRejectedValueOnce(new Error('fixture failure'));
    await expect(f.worker.run()).resolves.toBeUndefined();

    expect(read).toHaveBeenCalledTimes(2);
    expect(f.enqueue).toHaveBeenCalledTimes(2);
  });

  it('paginates full batches using the final trial identifier', async () => {
    const f = fixture();
    f.findMany.mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => ({ id: 'trial-' + i })))
      .mockResolvedValueOnce([{ id: 'last' }]);
    read.mockResolvedValue(null);
    await f.worker.run();

    expect(f.findMany).toHaveBeenCalledTimes(2);
    expect(f.findMany.mock.calls[1]![0].where.id).toEqual({ gt: 'trial-99' });
    expect(read).toHaveBeenCalledTimes(101);
  });

  it('contains batch query failures without invoking the outbox', async () => {
    const f = fixture();
    f.findMany.mockRejectedValue(new Error('database unavailable'));
    await expect(f.worker.run()).resolves.toBeUndefined();
    expect(f.enqueue).not.toHaveBeenCalled();
  });
});
