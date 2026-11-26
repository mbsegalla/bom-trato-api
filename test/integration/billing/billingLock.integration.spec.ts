import { randomUUID } from 'node:crypto';

import { expect, it } from 'vitest';

import { BillingError } from '../../../src/modules/billing/domain/errors/billing.error.js';
import { PostgresBillingLock } from '../../../src/modules/billing/infrastructure/database/postgresBillingLock.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';

databaseSuite('billing mutex persistence (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  function fixture() {
    const key = 'organization:' + randomUUID();
    db.cleanup(() => db.prisma.billingMutex.deleteMany({ where: { key } }));

    return { key, lock: new PostgresBillingLock(db.prisma) };
  }

  it('persists an owned lease during work and removes it after success', async () => {
    const { key, lock } = fixture();

    await expect(
      lock.run(key, async () => {
        const row = await db.prisma.billingMutex.findUniqueOrThrow({ where: { key } });

        expect(row.recoveryRequired).toBe(false);
        expect(row.leaseUntil.getTime()).toBeGreaterThan(row.acquiredAt.getTime());

        return row.token;
      }),
    ).resolves.toEqual(expect.any(String));

    expect(await db.prisma.billingMutex.findUnique({ where: { key } })).toBeNull();
  });

  it('serializes competing workers on the same organization', async () => {
    const { key, lock } = fixture();
    let active = 0;
    let maximum = 0;
    const operation = async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      try {
        await new Promise<void>((resolve) => setTimeout(resolve, 80));
        return true;
      } finally {
        active -= 1;
      }
    };

    expect(await Promise.all([lock.run(key, operation), lock.run(key, operation)])).toEqual([true, true]);
    expect(maximum).toBe(1);
    expect(await db.prisma.billingMutex.findUnique({ where: { key } })).toBeNull();
  }, 15000);

  it('permits simultaneous work for different organizations', async () => {
    const first = fixture();
    const second = fixture();
    let entered = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const operation = async () => {
      entered += 1;
      if (entered === 2) {
        release();
      }

      await barrier;
      return entered;
    };

    const results = await Promise.all([first.lock.run(first.key, operation), second.lock.run(second.key, operation)]);

    expect(results).toEqual([2, 2]);
  }, 15000);

  it('reclaims an expired lease using a new ownership token', async () => {
    const { key, lock } = fixture();
    const oldToken = randomUUID();
    await db.prisma.billingMutex.create({
      data: {
        key,
        token: oldToken,
        acquiredAt: new Date(Date.now() - 60000),
        leaseUntil: new Date(Date.now() - 1000),
      },
    });

    await lock.run(key, async () => {
      const row = await db.prisma.billingMutex.findUniqueOrThrow({ where: { key } });
      expect(row.token).not.toBe(oldToken);
      expect(row.leaseUntil.getTime()).toBeGreaterThan(Date.now());
    });

    expect(await db.prisma.billingMutex.findUnique({ where: { key } })).toBeNull();
  });

  it('retains recovery state after an ambiguous failure and rejects subsequent work', async () => {
    const { key, lock } = fixture();
    const error = new Error('Fixture upstream timeout');

    await expect(lock.run(key, () => Promise.reject(error))).rejects.toBe(error);
    expect(await db.prisma.billingMutex.findUniqueOrThrow({ where: { key } })).toMatchObject({
      recoveryRequired: true,
    });

    let executed = false;
    await expect(
      lock.run(key, async () => {
        executed = true;
      }),
    ).rejects.toMatchObject({
      code: 'BILLING_RECONCILIATION_REQUIRED',
    });
    expect(executed).toBe(false);
  });

  it('releases expected domain failures and permits the next operation', async () => {
    const { key, lock } = fixture();
    const error = new BillingError('PRICE_MISMATCH');

    await expect(lock.run(key, () => Promise.reject(error))).rejects.toBe(error);
    expect(await db.prisma.billingMutex.findUnique({ where: { key } })).toBeNull();
    await expect(lock.run(key, async () => 'retry')).resolves.toBe('retry');
  });
});
