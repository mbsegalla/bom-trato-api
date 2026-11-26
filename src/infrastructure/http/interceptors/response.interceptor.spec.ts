import type { ExecutionContext } from '@nestjs/common';
import { StreamableFile } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ResponseInterceptor } from './response.interceptor.js';

function fixture(statusCode: number, method = 'GET', headersSent = false, bypass = false) {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(bypass) } as unknown as Reflector;
  const context = {
    getType: () => 'http',
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ method }), getResponse: () => ({ statusCode, headersSent }) }),
  } as unknown as ExecutionContext;
  const interceptor = new ResponseInterceptor(reflector);

  return (data: unknown) => firstValueFrom(interceptor.intercept(context, { handle: () => of(data) }));
}

describe('ResponseInterceptor', () => {
  it('wraps successful responses and represents missing data as null', async () => {
    expect(await fixture(201)({ id: 'item' })).toEqual({ statusCode: 201, success: true, data: { id: 'item' } });
    expect(await fixture(200)(undefined)).toEqual({ statusCode: 200, success: true, data: null });
  });

  it.each([204, 205, 304])('does not attach a body to status %i', async (status) => {
    expect(await fixture(status)({ id: 'item' })).toBeUndefined();
  });

  it('does not wrap streams, explicit bypass, already sent responses or redirects', async () => {
    const stream = new StreamableFile(Buffer.from('fixture'));

    expect(await fixture(200)(stream)).toBe(stream);
    expect(await fixture(200, 'HEAD')('body')).toBeUndefined();
    for (const transform of [fixture(302), fixture(200, 'GET', true), fixture(200, 'GET', false, true)]) {
      expect(await transform('raw')).toBe('raw');
    }
  });
});
