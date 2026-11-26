import { describe, expect, it, vi } from 'vitest';

import type { Request, Response } from 'express';
import { AuthCookies } from './authCookies.js';

const origin = 'https://web.example.invalid';
const now = 1790000000000;
function fixture() {
  const cookies = new AuthCookies(
    { csrfSecret: 'a'.repeat(64) } as ConstructorParameters<typeof AuthCookies>[0],
    { isProduction: true, frontendUrl: origin } as ConstructorParameters<typeof AuthCookies>[1],
  );
  const cookie = vi.fn();
  const setHeader = vi.fn();
  const clearCookie = vi.fn();
  const response = { cookie, setHeader, clearCookie } as unknown as Response;
  const request = (token: string, refresh = 'fixture-refresh', requestOrigin = origin, header = token) => ({
    cookies: { '__Host-bomTratoCsrf': token, '__Host-bomTratoRefresh': refresh },
    get: (name: string) => name === 'origin' ? requestOrigin : name === 'x-csrf-token' ? header : undefined,
  }) as unknown as Request;

  return {
    cookies,
    response,
    cookie,
    setHeader,
    clearCookie,
    request
  };
}

describe('AuthCookies', () => {
  it('issues secure host-only cookies and binds the CSRF token to the current refresh credential', () => {
    const f = fixture();
    const token = f.cookies.setSession(f.response, 'fixture-refresh', new Date(Date.now() + 86400000));

    expect(f.cookie).toHaveBeenCalledWith('__Host-bomTratoRefresh', 'fixture-refresh', expect.objectContaining({
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    }));
    expect(f.cookie).toHaveBeenCalledWith(
      '__Host-bomTratoCsrf',
      token,
      expect.objectContaining({
        secure: true,
        httpOnly: true,
        maxAge: 3600000
      })
    );
    expect(() => f.cookies.assertCsrf(f.request(token))).not.toThrow();
    expect(() => f.cookies.assertCsrf(f.request(token, 'different-refresh'))).toThrow('Invalid CSRF token');
    expect(f.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('rejects mismatched origins, missing header, altered signature and expired tokens', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const f = fixture();
      const token = f.cookies.issueCsrf(f.response, 'fixture-refresh');
      expect(() => f.cookies.assertCsrf(f.request(token, 'fixture-refresh', 'https://other.example.invalid'))).toThrow('Request origin is not allowed');
      expect(() => f.cookies.assertCsrf(f.request(token, 'fixture-refresh', origin, ''))).toThrow('Invalid CSRF token');
      const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
      expect(() => f.cookies.assertCsrf(f.request(tampered))).toThrow('Invalid CSRF token');
      clock.mockReturnValue(now + 3600000);
      expect(() => f.cookies.assertCsrf(f.request(token))).toThrow('Invalid CSRF token');
    } finally {
      clock.mockRestore();
    }
  });

  it('clears both cookies with the same secure scope', () => {
    const f = fixture();
    f.cookies.clear(f.response);

    expect(f.clearCookie).toHaveBeenCalledWith('__Host-bomTratoRefresh', expect.objectContaining({ secure: true, path: '/' }));
    expect(f.clearCookie).toHaveBeenCalledWith('__Host-bomTratoCsrf', expect.objectContaining({ secure: true, path: '/' }));
  });
});
