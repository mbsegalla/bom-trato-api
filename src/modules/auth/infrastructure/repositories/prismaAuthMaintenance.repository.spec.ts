import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PrismaAuthMaintenanceRepository } from './prismaAuthMaintenance.repository.js';

const params = {
  refreshTokenBefore: new Date('2025-01-01'),
  expiredBefore: new Date('2024-12-01'),
  rateLimitBefore: new Date('2024-11-01'),
  limit: 25,
};

describe('PrismaAuthMaintenanceRepository', () => {
  it('executes bounded cleanup operations in a single transaction in dependency order', async () => {
    const executeRaw = vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(2).mockResolvedValueOnce(4).mockResolvedValueOnce(5);
    const transaction = vi.fn(async (operation: (tx: { $executeRaw: typeof executeRaw }) => Promise<unknown>) =>
      operation({ $executeRaw: executeRaw }),
    );
    const repository = new PrismaAuthMaintenanceRepository({ $transaction: transaction } as unknown as PrismaService);

    expect(await repository.cleanup(params)).toEqual({ refreshTokens: 3, sessions: 2, actionTokens: 4, rateLimits: 5 });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]?.[0]).toBeTypeOf('function');
    expect(executeRaw).toHaveBeenCalledTimes(4);
    const sql = executeRaw.mock.calls.map(([parts]) => (parts as TemplateStringsArray).join('?'));
    expect(sql[0]).toContain('DELETE FROM "RefreshToken"');
    expect(sql[1]).toContain('DELETE FROM "AuthSession"');
    expect(sql[2]).toContain('DELETE FROM "AuthActionToken"');
    expect(sql[3]).toContain('DELETE FROM "AuthRateLimit"');
    expect(sql.every((query) => query.includes('SKIP LOCKED'))).toBe(true);
    expect(executeRaw.mock.calls.every((call) => call.includes(params.limit))).toBe(true);
  });

  it('propagates database failures and does not continue subsequent cleanup statements', async () => {
    const error = new Error('database unavailable');
    const executeRaw = vi.fn().mockResolvedValueOnce(1).mockRejectedValueOnce(error);
    const transaction = vi.fn(async (operation: (tx: { $executeRaw: typeof executeRaw }) => Promise<unknown>) =>
      operation({ $executeRaw: executeRaw }),
    );
    const repository = new PrismaAuthMaintenanceRepository({ $transaction: transaction } as unknown as PrismaService);

    await expect(repository.cleanup(params)).rejects.toBe(error);

    expect(executeRaw).toHaveBeenCalledTimes(2);
  });
});
