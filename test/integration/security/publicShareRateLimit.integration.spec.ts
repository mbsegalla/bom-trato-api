import { randomBytes } from 'node:crypto';

import type { Response } from 'express';
import { expect, it, vi } from 'vitest';

import { PostgresPublicShareRateLimit } from '../../../src/infrastructure/http/rateLimits/postgresPublicShareRateLimit.js';
import { hmacSha256 } from '../../../src/shared/security/hmac.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';

databaseSuite('public share rate limits (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  it('persists a bounded bucket, isolates scopes and resets an expired window', async () => {
    const secret = randomBytes(32).toString('hex');
    const ip = '192.0.2.1';
    const key = hmacSha256(secret, 'quote-share:' + ip, 'hex');
    const otherKey = hmacSha256(secret, 'work-order-share:' + ip, 'hex');
    db.cleanup(() => db.prisma.quoteShareRateLimit.deleteMany({ where: { key: { in: [key, otherKey] } } }));
    const setHeader = vi.fn();
    const response = { setHeader } as unknown as Response;
    const limiter = new PostgresPublicShareRateLimit(db.prisma, secret, 'quote-share');

    await limiter.check(ip, response);
    await db.prisma.quoteShareRateLimit.update({ where: { key }, data: { count: 59 } });
    const results = await Promise.allSettled([limiter.check(ip, response), limiter.check(ip, response)]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(limiter.check(ip, response)).rejects.toMatchObject({ status: 429 });
    expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.stringMatching(/^\d+$/));
    expect((await db.prisma.quoteShareRateLimit.findUniqueOrThrow({ where: { key } })).count).toBe(61);

    await new PostgresPublicShareRateLimit(db.prisma, secret, 'work-order-share').check(ip, response);

    expect((await db.prisma.quoteShareRateLimit.findUniqueOrThrow({ where: { key: otherKey } })).count).toBe(1);

    await db.prisma.quoteShareRateLimit.update({ where: { key }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await limiter.check(ip, response);

    expect((await db.prisma.quoteShareRateLimit.findUniqueOrThrow({ where: { key } })).count).toBe(1);
  });
});
