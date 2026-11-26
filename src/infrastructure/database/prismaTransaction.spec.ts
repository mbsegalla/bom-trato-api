import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from './prisma.service.js';
import { readTransaction, writeTransaction } from './prismaTransaction.js';

const serializationError = () => new Prisma.PrismaClientKnownRequestError('fixture conflict', {
  code: 'P2034',
  clientVersion: 'fixture'
});

describe('Prisma transaction boundaries', () => {
  it('sets read-only before executing a repeatable-read operation', async () => {
    const execute = vi.fn().mockResolvedValue(0);
    const db = { $executeRaw: execute } as unknown as Prisma.TransactionClient;
    const transaction = vi.fn(async (operation: (client: Prisma.TransactionClient) => Promise<unknown>) => operation(db));
    const operation = vi.fn().mockResolvedValue('result');

    expect(await readTransaction({ $transaction: transaction } as unknown as PrismaService, operation)).toBe('result');
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
      maxWait: 5000,
      timeout: 10000
    });
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(operation.mock.invocationCallOrder[0]!);
  });

  it('retries only known serialization conflicts, returning the eventual result', async () => {
    const transaction = vi.fn().mockRejectedValueOnce(serializationError()).mockRejectedValueOnce(serializationError()).mockResolvedValueOnce('result');
    const conflict = vi.fn(() => new Error('conflict'));

    expect(await writeTransaction({ $transaction: transaction } as unknown as PrismaService, vi.fn(), conflict)).toBe('result');
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(conflict).not.toHaveBeenCalled();
  });

  it('exhausts the retry budget and never retries unrelated persistence failures', async () => {
    const transaction = vi.fn().mockRejectedValue(serializationError());
    const conflict = vi.fn(() => new Error('conflict budget exhausted'));

    await expect(writeTransaction({ $transaction: transaction } as unknown as PrismaService, vi.fn(), conflict)).rejects.toThrow('conflict budget exhausted');
    expect(transaction).toHaveBeenCalledTimes(3);

    transaction.mockReset().mockRejectedValue(new Error('unrelated failure'));

    await expect(writeTransaction({ $transaction: transaction } as unknown as PrismaService, vi.fn(), conflict)).rejects.toThrow('unrelated failure');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(conflict).toHaveBeenCalledTimes(1);
  });
});
