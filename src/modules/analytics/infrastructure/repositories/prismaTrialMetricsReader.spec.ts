import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

import { PrismaTrialMetricsReader } from './prismaTrialMetricsReader.js';

const period = { from: new Date('2026-01-01'), toExclusive: new Date('2026-02-01'), asOf: new Date('2026-02-02') };
const counts = {
  started: 5,
  linkedOrganizations: 4,
  openWindow: 1,
  expired: 1,
  revoked: 1,
  detached: 1,
  converted: 1,
  convertedBeforeExpiration: 1,
  convertedAfterExpiration: 0,
  matured: 3,
  maturedConvertedBeforeExpiration: 1,
  customersCreated: 3,
  quotesCreated: 2,
  workOrdersCreated: 1,
  checkoutStarted: 2,
};

function fixture() {
  const query = vi.fn().mockResolvedValue([]);
  const execute = vi.fn().mockResolvedValue(0);
  const db = { $queryRaw: query, $executeRaw: execute };
  const transaction = vi.fn(async (operation: (client: typeof db) => Promise<unknown>) => operation(db));
  const reader = new PrismaTrialMetricsReader({ $transaction: transaction } as unknown as PrismaService);

  return { reader, query, execute, transaction };
}

describe('PrismaTrialMetricsReader', () => {
  it('separates total and cohort counts from notification metrics in a read-only snapshot', async () => {
    const f = fixture();
    const notifications = [
      { stage: 'FIRST_QUOTE', total: 2, pending: 1, processing: 0, accepted: 1, failed: 0, skipped: 0 },
    ];
    f.query
      .mockResolvedValueOnce([
        { ...counts, weekStart: null },
        { ...counts, weekStart: '2026-01-05' },
      ])
      .mockResolvedValueOnce(notifications);

    expect(await f.reader.read(period)).toEqual({
      total: counts,
      cohorts: [{ weekStart: '2026-01-05', counts }],
      notifications,
    });
    expect(f.execute.mock.calls[0][0].join(' ')).toContain('SET TRANSACTION READ ONLY');
    expect(f.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'RepeatableRead' }),
    );
  });

  it('passes the exact observation period to both SQL queries', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([{ ...counts, weekStart: null }]);

    await f.reader.read(period);

    for (const call of f.query.mock.calls) {
      expect(call.slice(1)).toEqual([period.from, period.toExclusive, period.asOf]);
    }
    expect(f.query.mock.calls[0][0].join(' ')).toContain('GROUP BY GROUPING SETS');
    expect(f.query.mock.calls[1][0].join(' ')).toContain('WHERE "type" = \'TRIAL_LIFECYCLE\'');
  });

  it('rejects an incomplete report without a total row', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([{ ...counts, weekStart: '2026-01-05' }]);
    await expect(f.reader.read(period)).rejects.toThrow('TRIAL_METRICS_TOTAL_NOT_FOUND');
  });

  it('propagates database failures instead of reporting fabricated zero counts', async () => {
    const f = fixture();
    const error = new Error('database unavailable');
    f.query.mockRejectedValueOnce(error);

    await expect(f.reader.read(period)).rejects.toBe(error);
    expect(f.query).toHaveBeenCalledTimes(1);
  });
});
