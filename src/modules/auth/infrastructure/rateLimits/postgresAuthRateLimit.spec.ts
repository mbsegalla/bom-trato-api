import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { hmacSha256 } from '../../../../shared/security/hmac.js';

import { PostgresAuthRateLimit } from './postgresAuthRateLimit.js';

const secret = 'a'.repeat(64);

function fixture(body: unknown = {}, ip: string | undefined = '127.0.0.1', remoteAddress?: string) {
  const query = vi
    .fn<(parts: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>>()
    .mockResolvedValue([{ count: 1, expiresAt: new Date(Date.now() + 60000) }]);
  const setHeader = vi.fn();
  const limiter = new PostgresAuthRateLimit({ $queryRaw: query } as unknown as PrismaService, secret);
  const request = { body, ip, socket: { remoteAddress } } as unknown as Request;
  const response = { setHeader } as unknown as Response;

  return { limiter, request, response, query, setHeader };
}

describe('PostgresAuthRateLimit', () => {
  it('uses distinct hashed IP, route and normalized email buckets', async () => {
    const f = fixture({ email: '  USER@EXAMPLE.INVALID  ' });

    await f.limiter.check(f.request, f.response, 'login');

    expect(f.query).toHaveBeenCalledTimes(3);
    expect(f.query.mock.calls.map((call) => call[1])).toEqual([
      hmacSha256(secret, 'ip:127.0.0.1', 'hex'),
      hmacSha256(secret, 'route:login:127.0.0.1', 'hex'),
      hmacSha256(secret, 'email:login:user@example.invalid', 'hex'),
    ]);
    expect(f.setHeader).not.toHaveBeenCalled();
  });

  it('does not consume a route-specific bucket for CSRF requests', async () => {
    const f = fixture();
    await f.limiter.check(f.request, f.response, 'csrf');
    expect(f.query).toHaveBeenCalledTimes(1);
  });

  it.each(['resend-verification', 'forgot-password'])('applies email cooldown for %s', async (bucket) => {
    const f = fixture({ email: 'user@example.invalid' });

    await f.limiter.check(f.request, f.response, bucket);

    expect(f.query).toHaveBeenCalledTimes(4);
    expect(f.query.mock.calls[3][1]).toBe(
      hmacSha256(secret, 'email-cooldown:' + bucket + ':user@example.invalid', 'hex'),
    );
  });

  it.each([null, 'email', {}, { email: 123 }, { email: 'x'.repeat(255) }])(
    'ignores invalid email bodies %j',
    async (body) => {
      const f = fixture(body);
      await f.limiter.check(f.request, f.response, 'login');
      expect(f.query).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    ['192.0.2.1', '192.0.2.1'],
    [undefined, 'unknown'],
  ] as const)('falls back to socket IP or unknown', async (remote, expected) => {
    const f = fixture({}, '127.0.0.1', remote);
    Object.assign(f.request, { ip: undefined });
    await f.limiter.check(f.request, f.response, 'csrf');
    expect(f.query.mock.calls[0][1]).toBe(hmacSha256(secret, 'ip:' + expected, 'hex'));
  });

  it('rejects excess IP attempts without consuming later buckets', async () => {
    const f = fixture({ email: 'user@example.invalid' });
    f.query.mockResolvedValueOnce([{ count: 121, expiresAt: new Date(Date.now() + 30000) }]);

    await expect(f.limiter.check(f.request, f.response, 'login')).rejects.toMatchObject({ status: 429 });
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(f.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('accepts the exact limit and rejects an exceeded route limit', async () => {
    const f = fixture();
    f.query
      .mockResolvedValueOnce([{ count: 120, expiresAt: new Date() }])
      .mockResolvedValueOnce([{ count: 21, expiresAt: new Date(0) }]);
    await expect(f.limiter.check(f.request, f.response, 'login')).rejects.toMatchObject({ status: 429 });
    expect(f.setHeader).toHaveBeenCalledWith('Retry-After', '1');
  });

  it('fails closed if the database returns no counter', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([]);
    await expect(f.limiter.check(f.request, f.response, 'login')).rejects.toThrow('Rate limiter returned no result');
  });
});
