import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PostgresPublicShareRateLimit } from '../../../../../infrastructure/http/rateLimits/postgresPublicShareRateLimit.js';

import { ReceivablePaymentLinkRateLimitGuard } from './receivablePaymentLinkRateLimit.guard.js';

describe('ReceivablePaymentLinkRateLimitGuard', () => {
  it('sets privacy headers before checking the actual request IP, including rejected requests', async () => {
    const check = vi.fn().mockRejectedValue(new HttpException('rate limited', 429));
    const setHeader = vi.fn();
    const response = { setHeader };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '192.0.2.1',
          socket: { remoteAddress: '192.0.2.2' },
          headers: { 'x-forwarded-for': '192.0.2.3' },
        }),
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const guard = new ReceivablePaymentLinkRateLimitGuard({ check } as unknown as PostgresPublicShareRateLimit);

    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 429 });
    expect(check).toHaveBeenCalledWith('192.0.2.1', response);
    expect(setHeader.mock.calls).toEqual([
      ['Cache-Control', 'private, no-store, max-age=0'],
      ['Referrer-Policy', 'no-referrer'],
      ['X-Robots-Tag', 'noindex, nofollow, noarchive'],
      ['X-Content-Type-Options', 'nosniff'],
    ]);
    expect(setHeader.mock.invocationCallOrder.at(-1)).toBeLessThan(check.mock.invocationCallOrder[0]);

    check.mockResolvedValueOnce(undefined);

    expect(await guard.canActivate(context)).toBe(true);
  });
});
