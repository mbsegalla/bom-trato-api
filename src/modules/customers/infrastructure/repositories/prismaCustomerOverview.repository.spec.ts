import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaCustomerRepository } from './prismaCustomer.repository.js';

const row = {
  quoteCount: '2',
  workOrderCount: '1',
  completedWorkOrderCount: '1',
  pendingAmountInCents: '2147483648',
  overdueAmountInCents: '100',
  receivedAmountInCents: '9007199254740991',
};
const now = new Date('2026-01-01T00:00:00Z');

describe('PrismaCustomerRepository overview totals', () => {
  it('preserves integer totals beyond the database Int range without losing precision', async () => {
    const query = vi.fn().mockResolvedValue([row]);
    const repository = new PrismaCustomerRepository({ $queryRaw: query } as unknown as Prisma.TransactionClient, 'org');

    expect(await repository.overviewSummary('customer', now)).toEqual({
      quoteCount: 2,
      workOrderCount: 1,
      completedWorkOrderCount: 1,
      pendingAmountInCents: 2147483648,
      overdueAmountInCents: 100,
      receivedAmountInCents: Number.MAX_SAFE_INTEGER,
      currency: 'brl',
    });

    const [parts, ...values] = query.mock.calls[0]!;
    expect((parts as TemplateStringsArray).join('?')).toContain('payment."reversedAt" IS NULL');
    expect(values.filter((value) => value === 'org')).toHaveLength(4);
    expect(values.filter((value) => value === 'customer')).toHaveLength(4);
    expect(values).toContain(now);
  });

  it.each(['-1', '1.5', 'NaN', '9007199254740992', ''])('rejects unsafe aggregate value %s', async (value) => {
    const query = vi.fn().mockResolvedValue([{ ...row, pendingAmountInCents: value }]);
    const repository = new PrismaCustomerRepository({ $queryRaw: query } as unknown as Prisma.TransactionClient, 'org');

    await expect(repository.overviewSummary('customer', now)).rejects.toThrow('CUSTOMER_OVERVIEW_VALUE_OUT_OF_RANGE');
  });

  it('rejects missing aggregate rows rather than inventing a zero balance', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const repository = new PrismaCustomerRepository({ $queryRaw: query } as unknown as Prisma.TransactionClient, 'org');

    await expect(repository.overviewSummary('customer', now)).rejects.toThrow('CUSTOMER_OVERVIEW_VALUE_OUT_OF_RANGE');
  });
});
