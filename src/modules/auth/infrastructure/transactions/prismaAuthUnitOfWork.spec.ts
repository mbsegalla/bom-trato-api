import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { PrismaNotificationOutbox } from '../../../notifications/infrastructure/repositories/prismaNotificationOutbox.repository.js';
import { PrismaAuthRepository } from '../repositories/prismaAuth.repository.js';

import { PrismaAuthUnitOfWork } from './prismaAuthUnitOfWork.js';

function fixture() {
  const db = {};
  const notifications = {};
  const transaction = vi.fn(async (operation: (client: typeof db) => Promise<unknown>) => operation(db));
  const using = vi.fn((_client: unknown, _inserted: () => void) => notifications);
  const notifyWorker = vi.fn();
  const unit = new PrismaAuthUnitOfWork(
    { $transaction: transaction } as unknown as PrismaService,
    { using, notifyWorker } as unknown as PrismaNotificationOutbox,
  );

  return { unit, db, notifications, transaction, using, notifyWorker };
}

describe('PrismaAuthUnitOfWork', () => {
  it('runs the operation with transaction-scoped repositories and preserves its return value', async () => {
    const f = fixture();

    await expect(
      f.unit.run(async (tx) => {
        expect(tx.auth).toBeInstanceOf(PrismaAuthRepository);
        expect(tx.notifications).toBe(f.notifications);
        return 'result';
      }),
    ).resolves.toBe('result');

    expect(f.transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 5000, timeout: 10000 });
    expect(f.using).toHaveBeenCalledWith(f.db, expect.any(Function));
    expect(f.notifyWorker).not.toHaveBeenCalled();
  });

  it('wakes the worker once only after a successful transaction', async () => {
    const f = fixture();

    await f.unit.run(async () => {
      const inserted = f.using.mock.calls[0][1];
      inserted();
      inserted();
      expect(f.notifyWorker).not.toHaveBeenCalled();
    });

    expect(f.notifyWorker).toHaveBeenCalledTimes(1);
  });

  it('does not wake the worker after a failed operation', async () => {
    const f = fixture();
    const error = new Error('transaction failure');

    await expect(
      f.unit.run(async () => {
        f.using.mock.calls[0][1]();
        throw error;
      }),
    ).rejects.toBe(error);
    expect(f.notifyWorker).not.toHaveBeenCalled();
  });

  it('propagates transaction acquisition failure without running the operation', async () => {
    const f = fixture();
    const error = new Error('database unavailable');
    f.transaction.mockRejectedValueOnce(error);
    const operation = vi.fn();

    await expect(f.unit.run(operation)).rejects.toBe(error);
    expect(operation).not.toHaveBeenCalled();
    expect(f.notifyWorker).not.toHaveBeenCalled();
  });
});
