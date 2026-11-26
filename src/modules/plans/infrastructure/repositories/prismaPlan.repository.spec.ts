import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

import { PrismaPlanRepository } from './prismaPlan.repository.js';

const record = {
  id: 'plan',
  code: 'FIXTURE',
  name: 'Fixture plan',
  description: null,
  maxUsers: 3,
  teamManagementEnabled: true,
  planPrices: [
    { id: 'price-month', amountInCents: 1000, currency: 'brl', interval: 'MONTH', intervalCount: 1 },
    { id: 'price-year', amountInCents: 10000, currency: 'brl', interval: 'YEAR', intervalCount: 1 },
  ],
};

describe('PrismaPlanRepository', () => {
  it('selects only published active plans and prices and maps public price fields', async () => {
    const findMany = vi.fn().mockResolvedValue([record]);
    const repository = new PrismaPlanRepository({ plan: { findMany } } as unknown as PrismaService);

    const plans = await repository.findAvailable();

    expect(plans[0]).toMatchObject({
      id: record.id,
      code: record.code,
      maxUsers: 3,
      prices: record.planPrices,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          published: true,
          stripeActive: true,
          planPrices: { some: { published: true, stripeActive: true } },
        },
        orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
        select: expect.objectContaining({
          planPrices: expect.objectContaining({
            where: { published: true, stripeActive: true },
            select: { id: true, amountInCents: true, currency: true, interval: true, intervalCount: true },
          }),
        }),
      }),
    );
  });

  it('reports an empty available catalog as a domain error', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaPlanRepository({ plan: { findMany } } as unknown as PrismaService);

    await expect(repository.findAvailable()).rejects.toThrow('PLAN_NOT_FOUND');
  });

  it('propagates database failures rather than returning a misleading empty catalog', async () => {
    const error = new Error('database unavailable');
    const findMany = vi.fn().mockRejectedValue(error);
    const repository = new PrismaPlanRepository({ plan: { findMany } } as unknown as PrismaService);

    await expect(repository.findAvailable()).rejects.toBe(error);
  });
});
