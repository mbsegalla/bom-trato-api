import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import type { AuthSecurity } from '../../../application/ports/authSecurity.port.js';
import { AuthError } from '../../../domain/errors/auth.error.js';
import type { AuthRepository } from '../../../domain/repositories/auth.repository.js';
import type { PostgresAuthRateLimit } from '../../../infrastructure/rateLimits/postgresAuthRateLimit.js';
import type { AuthCookies } from '../authCookies.js';
import type { AuthEndpointPolicy } from '../decorators/authEndpoint.decorator.js';
import { AUTH_ENDPOINT } from '../decorators/authEndpoint.decorator.js';

import { AccessTokenGuard } from './accessToken.guard.js';

function fixture(authorization?: string, policy?: AuthEndpointPolicy, isPublic = false) {
  const user = { id: 'fixture-user' };
  const claims = { sub: user.id, sid: 'fixture-session' };
  const verifyAccess = vi.fn().mockResolvedValue(claims);
  const authenticate = vi.fn().mockResolvedValue(user);
  const check = vi.fn().mockResolvedValue(undefined);
  const assertCsrf = vi.fn();
  const assertOrigin = vi.fn();
  const setHeader = vi.fn();
  const request = { get: vi.fn().mockReturnValue(authorization), auth: undefined as unknown };
  const response = { setHeader };
  const reflector = {
    getAllAndOverride: vi.fn((key: string) => (key === AUTH_ENDPOINT ? policy : isPublic)),
  };
  const context = {
    getType: () => 'http',
    getHandler: () => fixture,
    getClass: () => AccessTokenGuard,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  const guard = new AccessTokenGuard(
    reflector as unknown as Reflector,
    { verifyAccess } as unknown as AuthSecurity,
    { authenticate } as unknown as AuthRepository,
    { assertCsrf, assertOrigin } as unknown as AuthCookies,
    { check } as unknown as PostgresAuthRateLimit,
  );

  return {
    guard,
    context,
    user,
    claims,
    request,
    response,
    verifyAccess,
    authenticate,
    check,
    assertCsrf,
    assertOrigin,
    setHeader,
  };
}

describe('AccessTokenGuard', () => {
  it.each([undefined, '', 'Basic token', 'Bearer', 'Bearer two tokens', 'Bearer ' + 'x'.repeat(4097)])(
    'rejects malformed or oversized authorization without verifying credentials',
    async (header) => {
      const f = fixture(header);

      await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({ status: 401 });
      expect(f.verifyAccess).not.toHaveBeenCalled();
      expect(f.authenticate).not.toHaveBeenCalled();
      expect(f.request.auth).toBeUndefined();
    },
  );

  it('binds verified token claims to a persisted session and attaches the authenticated user', async () => {
    const f = fixture('bEaReR fixture-token');

    expect(await f.guard.canActivate(f.context)).toBe(true);
    expect(f.verifyAccess).toHaveBeenCalledExactlyOnceWith('fixture-token');
    expect(f.authenticate).toHaveBeenCalledExactlyOnceWith(
      {
        userId: f.claims.sub,
        sessionId: f.claims.sid,
      },
      expect.any(Date),
    );
    expect(f.request.auth).toEqual({ user: f.user, sessionId: f.claims.sid });
    expect(f.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('does not consult the session repository when token verification fails', async () => {
    const f = fixture('Bearer fixture-token');
    f.verifyAccess.mockRejectedValue(new AuthError('INVALID_TOKEN'));

    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
      status: 401,
      publicError: { code: 'INVALID_SESSION' },
    });
    expect(f.authenticate).not.toHaveBeenCalled();
    expect(f.request.auth).toBeUndefined();
  });

  it('rejects a revoked or expired session even with valid token claims', async () => {
    const f = fixture('Bearer fixture-token');
    f.authenticate.mockRejectedValue(new AuthError('INVALID_SESSION'));

    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({ status: 401 });
    expect(f.request.auth).toBeUndefined();
  });

  it('permits a public route without authenticating', async () => {
    const f = fixture(undefined, undefined, true);

    expect(await f.guard.canActivate(f.context)).toBe(true);
    expect(f.verifyAccess).not.toHaveBeenCalled();
    expect(f.authenticate).not.toHaveBeenCalled();
  });

  it('enforces rate limiting and CSRF even on public mutations', async () => {
    const f = fixture(undefined, { bucket: 'login', mutation: true }, true);

    expect(await f.guard.canActivate(f.context)).toBe(true);
    expect(f.check).toHaveBeenCalledExactlyOnceWith(f.request, f.response, 'login');
    expect(f.assertCsrf).toHaveBeenCalledExactlyOnceWith(f.request);
    expect(f.assertOrigin).not.toHaveBeenCalled();
    expect(f.verifyAccess).not.toHaveBeenCalled();
    expect(f.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('checks origin for public CSRF issuance without requiring an existing CSRF token', async () => {
    const f = fixture(undefined, { bucket: 'csrf', mutation: false }, true);

    expect(await f.guard.canActivate(f.context)).toBe(true);
    expect(f.assertOrigin).toHaveBeenCalledExactlyOnceWith(f.request);
    expect(f.assertCsrf).not.toHaveBeenCalled();
  });

  it('stops before CSRF validation or authentication when rate limiting fails', async () => {
    const f = fixture('Bearer fixture-token', { bucket: 'login', mutation: true });
    const error = new Error('rate limit');
    f.check.mockRejectedValue(error);

    await expect(f.guard.canActivate(f.context)).rejects.toBe(error);
    expect(f.assertCsrf).not.toHaveBeenCalled();
    expect(f.verifyAccess).not.toHaveBeenCalled();
  });

  it('stops before authentication when CSRF validation fails', async () => {
    const f = fixture('Bearer fixture-token', { bucket: 'logout', mutation: true });
    const error = new Error('invalid CSRF');
    f.assertCsrf.mockImplementation(() => {
      throw error;
    });

    await expect(f.guard.canActivate(f.context)).rejects.toBe(error);
    expect(f.verifyAccess).not.toHaveBeenCalled();
  });
});
