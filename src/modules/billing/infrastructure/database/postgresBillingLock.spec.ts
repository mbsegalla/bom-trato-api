import { afterEach, describe, expect, it, vi } from 'vitest';

import { asymmetric } from '../../../../../test/support/asymmetricMatchers.js';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { BillingError } from '../../domain/errors/billing.error.js';

import { PostgresBillingLock } from './postgresBillingLock.js';

const key = 'organization:11111111-1111-4111-8111-111111111111';

function fixture() {
  const createMany = vi
    .fn<
      (args: {
        data: { key: string; token: string; acquiredAt: Date; leaseUntil: Date }[];
        skipDuplicates: boolean;
      }) => Promise<{ count: number }>
    >()
    .mockResolvedValue({ count: 1 });
  const findUnique = vi.fn().mockResolvedValue(null);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const lock = new PostgresBillingLock({
    billingMutex: { createMany, findUnique, updateMany, deleteMany },
  } as unknown as PrismaService);

  return { lock, createMany, findUnique, updateMany, deleteMany };
}

describe('PostgresBillingLock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes once and releases only the acquired token', async () => {
    const f = fixture();
    const operation = vi.fn().mockResolvedValue('result');

    expect(await f.lock.run(key, operation)).toBe('result');
    expect(operation).toHaveBeenCalledTimes(1);
    const { data } = f.createMany.mock.calls[0][0];
    const { token, acquiredAt, leaseUntil } = data[0];

    expect(leaseUntil.getTime() - acquiredAt.getTime()).toBe(30_000);
    expect(f.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { key, token } });
  });

  it('releases the lease on an expected domain error', async () => {
    const f = fixture();
    const error = new BillingError('PRICE_MISMATCH');

    await expect(f.lock.run(key, () => Promise.reject(error))).rejects.toBe(error);
    expect(f.deleteMany).toHaveBeenCalledTimes(1);
    expect(f.updateMany).not.toHaveBeenCalled();
  });

  it('marks recovery instead of releasing after an ambiguous failure', async () => {
    const f = fixture();
    const error = new Error('provider timeout');

    await expect(f.lock.run(key, () => Promise.reject(error))).rejects.toBe(error);
    expect(f.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { key, token: asymmetric.any(String) },
      data: { recoveryRequired: true },
    });
    expect(f.deleteMany).not.toHaveBeenCalled();
  });

  it('blocks operations while reconciliation is required', async () => {
    const f = fixture();
    f.createMany.mockResolvedValue({ count: 0 });
    f.findUnique.mockResolvedValue({ recoveryRequired: true });
    const operation = vi.fn();

    await expect(f.lock.run(key, operation)).rejects.toMatchObject({
      code: 'BILLING_RECONCILIATION_REQUIRED',
    });
    expect(operation).not.toHaveBeenCalled();
    expect(f.deleteMany).not.toHaveBeenCalled();
  });

  it('reclaims an expired lease only with the previous token and expiry guard', async () => {
    const f = fixture();
    f.createMany.mockResolvedValue({ count: 0 });
    f.findUnique.mockResolvedValue({
      token: 'old-token',
      acquiredAt: new Date(0),
      leaseUntil: new Date(1),
      recoveryRequired: false,
    });

    await expect(f.lock.run(key, async () => true)).resolves.toBe(true);
    expect(f.updateMany).toHaveBeenCalledWith({
      where: {
        key,
        token: 'old-token',
        recoveryRequired: false,
        leaseUntil: { lte: asymmetric.any(Date) },
      },
      data: {
        token: asymmetric.any(String),
        acquiredAt: asymmetric.any(Date),
        leaseUntil: asymmetric.any(Date),
      },
    });
  });

  it('converts acquisition failures without running the operation', async () => {
    const f = fixture();
    const cause = new Error('database unavailable');
    f.createMany.mockRejectedValue(cause);
    const operation = vi.fn();

    await expect(f.lock.run(key, operation)).rejects.toMatchObject({
      code: 'BILLING_WRITE_FAILED',
      cause,
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it.each([false, true])('requires reconciliation if release fails (exception: %s)', async (throws) => {
    const f = fixture();
    if (throws) {
      f.deleteMany.mockRejectedValue(new Error('database unavailable'));
    } else {
      f.deleteMany.mockResolvedValue({ count: 0 });
    }

    await expect(f.lock.run(key, async () => true)).rejects.toMatchObject({
      code: 'BILLING_RECONCILIATION_REQUIRED',
    });
  });

  it('requires reconciliation if recovery cannot be recorded', async () => {
    const f = fixture();
    f.updateMany.mockResolvedValue({ count: 0 });

    await expect(f.lock.run(key, () => Promise.reject(new Error('timeout')))).rejects.toMatchObject({
      code: 'BILLING_RECONCILIATION_REQUIRED',
    });
    expect(f.deleteMany).not.toHaveBeenCalled();
  });

  it('bounds retries when another owner holds an active lease', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.createMany.mockResolvedValue({ count: 0 });
    f.findUnique.mockResolvedValue({
      recoveryRequired: false,
      leaseUntil: new Date(Date.now() + 60_000),
    });
    const operation = vi.fn();
    const assertion = expect(f.lock.run(key, operation)).rejects.toMatchObject({ code: 'BILLING_BUSY' });

    await vi.advanceTimersByTimeAsync(2500);
    await assertion;
    expect(f.createMany).toHaveBeenCalledTimes(5);
    expect(operation).not.toHaveBeenCalled();
  });

  it('renews an owned lease while an operation is pending', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const result = f.lock.run(key, async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 11_000));

      return true;
    });

    await vi.advanceTimersByTimeAsync(11_000);
    await expect(result).resolves.toBe(true);
    expect(f.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { key, token: asymmetric.any(String), recoveryRequired: false },
      data: { leaseUntil: asymmetric.any(Date) },
    });
  });

  it('does not return success or release a lost lease', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.updateMany.mockResolvedValue({ count: 0 });
    const assertion = expect(
      f.lock.run(key, async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 11_000));

        return true;
      }),
    ).rejects.toMatchObject({ code: 'BILLING_RECONCILIATION_REQUIRED' });

    await vi.advanceTimersByTimeAsync(11_000);
    await assertion;
    expect(f.deleteMany).not.toHaveBeenCalled();
  });
});
