import { HttpException, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { LinkGoogleIdentityUseCase } from '../../../src/modules/auth/application/useCases/linkGoogleIdentity.useCase.js';
import { ListAuthIdentitiesUseCase } from '../../../src/modules/auth/application/useCases/listAuthIdentities.useCase.js';
import { ListSessionsUseCase } from '../../../src/modules/auth/application/useCases/listSessions.useCase.js';
import { LoginUseCase } from '../../../src/modules/auth/application/useCases/login.useCase.js';
import { LoginWithGoogleUseCase } from '../../../src/modules/auth/application/useCases/loginWithGoogle.useCase.js';
import { LogoutUseCase } from '../../../src/modules/auth/application/useCases/logout.useCase.js';
import { LogoutAllUseCase } from '../../../src/modules/auth/application/useCases/logoutAll.useCase.js';
import { RefreshSessionUseCase } from '../../../src/modules/auth/application/useCases/refreshSession.useCase.js';
import { RegisterUseCase } from '../../../src/modules/auth/application/useCases/register.useCase.js';
import { RequestPasswordResetUseCase } from '../../../src/modules/auth/application/useCases/requestPasswordReset.useCase.js';
import { ResendVerificationEmailUseCase } from '../../../src/modules/auth/application/useCases/resendVerificationEmail.useCase.js';
import { ResetPasswordUseCase } from '../../../src/modules/auth/application/useCases/resetPassword.useCase.js';
import { RevokeSessionUseCase } from '../../../src/modules/auth/application/useCases/revokeSession.useCase.js';
import { VerifyEmailUseCase } from '../../../src/modules/auth/application/useCases/verifyEmail.useCase.js';
import { AuthError } from '../../../src/modules/auth/domain/errors/auth.error.js';
import type { PostgresAuthRateLimit } from '../../../src/modules/auth/infrastructure/rateLimits/postgresAuthRateLimit.js';
import { AuthCookies } from '../../../src/modules/auth/presentation/http/authCookies.js';
import { AuthController } from '../../../src/modules/auth/presentation/http/controllers/auth.controller.js';
import { UserError } from '../../../src/modules/users/domain/errors/user.error.js';
import { asymmetric } from '../../support/asymmetricMatchers.js';
import { readJsonObject, readJsonString } from '../../support/testJson.js';
import { createHttpFixture, itemId, organizationId, userId } from '../support/http.fixture.js';

const origin = 'https://app.example.invalid';
const route = '/api/auth';
const password = 'Fixture-Password-123';
const email = 'owner@example.com';
const actionToken = 'a'.repeat(43);
const message = { message: 'If eligible, you will receive an email with the next steps.' };
const tokens = {
  accessToken: 'fixture-access',
  expiresIn: 900,
  refreshToken: 'fixture-refresh',
  refreshExpiresAt: new Date('2035-01-01'),
};
const cookies = new AuthCookies(
  { csrfSecret: 'fixture-csrf-secret' } as ConstructorParameters<typeof AuthCookies>[0],
  { isProduction: true, frontendUrl: origin } as ConstructorParameters<typeof AuthCookies>[1],
);
const registerBody = {
  name: 'Fixture Owner',
  email,
  password,
  selectedPlanPriceId: itemId,
  termsVersion: '1.0',
  privacyNoticeVersion: '1.0',
};

function cookieHeaders(headers: Record<string, unknown>): string[] {
  const values = headers['set-cookie'];
  return Array.isArray(values) ? values.map(String) : [];
}

describe('authentication HTTP contracts with real CSRF cookies', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const register = vi.fn();
  const login = vi.fn();
  const refresh = vi.fn();
  const logout = vi.fn();
  const logoutAll = vi.fn();
  const sessions = vi.fn();
  const revoke = vi.fn();
  const forgot = vi.fn();
  const resend = vi.fn();
  const verify = vi.fn();
  const reset = vi.fn();
  const google = vi.fn();
  const link = vi.fn();
  const identities = vi.fn();
  const rateLimit = vi.fn();

  beforeAll(async () => {
    const providers = [
      [RegisterUseCase, register],
      [LoginUseCase, login],
      [RefreshSessionUseCase, refresh],
      [LogoutUseCase, logout],
      [LogoutAllUseCase, logoutAll],
      [ListSessionsUseCase, sessions],
      [RevokeSessionUseCase, revoke],
      [RequestPasswordResetUseCase, forgot],
      [ResendVerificationEmailUseCase, resend],
      [VerifyEmailUseCase, verify],
      [ResetPasswordUseCase, reset],
      [LoginWithGoogleUseCase, google],
      [LinkGoogleIdentityUseCase, link],
      [ListAuthIdentitiesUseCase, identities],
    ] as const;
    fixture = await createHttpFixture(
      [AuthController],
      [
        { provide: AuthCookies, useValue: cookies },
        ...providers.map(([provide, execute]) => ({ provide, useValue: { execute } })),
      ],
      {
        cookies,
        rateLimit: { check: rateLimit } as unknown as PostgresAuthRateLimit,
        sessionId: itemId,
      },
    );
  });

  beforeEach(() => {
    for (const operation of [register, logout, logoutAll, revoke, forgot, resend, reset, link, rateLimit]) {
      operation.mockReset().mockResolvedValue(undefined);
    }
    for (const operation of [login, refresh, verify, google]) {
      operation.mockReset().mockResolvedValue(tokens);
    }
    sessions.mockReset().mockResolvedValue([]);
    identities.mockReset().mockResolvedValue({ providers: ['PASSWORD'] });
    fixture.verifyAccess.mockClear();
    fixture.authenticate.mockClear();
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  async function csrf(refreshToken?: string) {
    const response = await request(fixture.server)
      .get(route + '/csrf')
      .set('Origin', origin)
      .set('Cookie', refreshToken ? cookies.refreshName + '=' + refreshToken : '')
      .expect(200);
    const token = readJsonString(readJsonObject(readJsonObject(response.body).data).csrfToken);
    const values = cookieHeaders(response.headers).map((header) => header.split(';')[0]);
    if (refreshToken) {
      values.push(cookies.refreshName + '=' + refreshToken);
    }
    return { token, cookie: values.join('; '), response };
  }

  async function post(path: string, body: object = {}, refreshToken?: string, authenticated = false) {
    const session = await csrf(refreshToken);
    const req = request(fixture.server)
      .post(route + path)
      .set('Origin', origin)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.token)
      .set('User-Agent', 'fixture-agent');
    if (authenticated) {
      req.set('Authorization', 'Bearer fixture');
    }
    return req.send(body);
  }

  function assertTokenResponse(response: { body: { data: unknown }; headers: Record<string, unknown> }) {
    expect(readJsonObject(response.body).data).toEqual({
      accessToken: tokens.accessToken,
      expiresIn: 900,
      tokenType: 'Bearer',
      csrfToken: asymmetric.any(String),
    });
    const values = cookieHeaders(response.headers);
    expect(
      values.some(
        (value) =>
          value.startsWith(cookies.refreshName + '=' + tokens.refreshToken + ';') &&
          value.includes('HttpOnly') &&
          value.includes('Secure') &&
          value.includes('SameSite=Lax') &&
          value.includes('Path=/'),
      ),
    ).toBe(true);
    expect(values.some((value) => value.startsWith('__Host-bomTratoCsrf=') && value.includes('HttpOnly'))).toBe(true);
    expect(response.headers['cache-control']).toBe('no-store');
  }

  function assertCleared(headers: Record<string, unknown>) {
    const values = cookieHeaders(headers);
    expect(values.some((value) => value.startsWith(cookies.refreshName + '=;') && value.includes('Expires='))).toBe(
      true,
    );
    expect(values.some((value) => value.startsWith('__Host-bomTratoCsrf=;') && value.includes('Expires='))).toBe(true);
    expect(headers['cache-control']).toBe('no-store');
  }

  it('issues an origin-bound CSRF cookie and rejects requests from an untrusted origin', async () => {
    const { token, response } = await csrf();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}\.\d{13}\.[A-Za-z0-9_-]+$/);
    expect(cookieHeaders(response.headers).join(';')).toContain('__Host-bomTratoCsrf=' + token);
    expect(response.headers['cache-control']).toBe('no-store');
    await request(fixture.server)
      .get(route + '/csrf')
      .set('Origin', 'https://other.example.invalid')
      .expect(403);
  });

  it('rejects missing and tampered CSRF tokens before login execution', async () => {
    await request(fixture.server)
      .post(route + '/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(403);
    const session = await csrf();
    await request(fixture.server)
      .post(route + '/login')
      .set('Origin', origin)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.token + 'x')
      .send({ email, password })
      .expect(403);
    expect(login).not.toHaveBeenCalled();
  });

  it('rejects a valid CSRF token reused with a different refresh cookie', async () => {
    const session = await csrf('old-refresh');
    await request(fixture.server)
      .post(route + '/refresh')
      .set('Origin', origin)
      .set('Cookie', session.cookie.replace('old-refresh', 'different-refresh'))
      .set('X-CSRF-Token', session.token)
      .expect(403);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('applies rate limits before executing public mutations', async () => {
    const session = await csrf();
    rateLimit.mockRejectedValueOnce(new HttpException('Fixture rate limited', HttpStatus.TOO_MANY_REQUESTS));
    await request(fixture.server)
      .post(route + '/login')
      .set('Origin', origin)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.token)
      .send({ email, password })
      .expect(429);
    expect(login).not.toHaveBeenCalled();
  });

  it('normalizes registration fields and returns a generic response without credentials', async () => {
    const response = await post('/register', {
      ...registerBody,
      name: '  Fixture Owner  ',
      email: ' OWNER@EXAMPLE.COM ',
    });
    expect(response.status).toBe(201);
    expect(readJsonObject(response.body).data).toEqual(message);
    expect(register).toHaveBeenCalledWith(
      asymmetric.objectContaining({
        ...registerBody,
        ipAddress: asymmetric.any(String),
        userAgent: 'fixture-agent',
      }),
    );
  });

  it.each([
    { password: 'too-short' },
    { password: 'lowercase-password-123' },
    { password: 'NoSpecialCharacter123' },
    { termsVersion: '' },
    { selectedPlanPriceId: 'invalid' },
    { email: 'not-an-email' },
    { userId },
  ])('rejects invalid registration body fields: %j', async (patch) => {
    const response = await post('/register', { ...registerBody, ...patch });
    expect(response.status).toBe(400);
    expect(register).not.toHaveBeenCalled();
  });

  it('sets secure session cookies and passes the previous refresh token on login', async () => {
    const response = await post('/login', { email, password }, 'previous-refresh');
    expect(response.status).toBe(200);
    expect(login).toHaveBeenCalledWith({
      email,
      password,
      userAgent: 'fixture-agent',
      previousRefreshToken: 'previous-refresh',
    });
    assertTokenResponse(response);
  });

  it('maps invalid credentials to unauthorized without issuing a session', async () => {
    login.mockRejectedValueOnce(new AuthError('INVALID_CREDENTIALS'));
    const response = await post('/login', { email, password });
    expect(response.status).toBe(401);
    expect(readJsonObject(readJsonObject(response.body).error).code).toBe('INVALID_CREDENTIALS');
    expect(cookieHeaders(response.headers)).toHaveLength(0);
  });

  it('rotates refresh and CSRF cookies without exposing the new refresh token in the JSON body', async () => {
    const response = await post('/refresh', {}, 'previous-refresh');
    expect(response.status).toBe(200);
    expect(refresh).toHaveBeenCalledWith('previous-refresh');
    assertTokenResponse(response);
  });

  it.each([new AuthError('TOKEN_REUSED'), new UserError('INVALID_TOKEN')])(
    'clears cookies for rejected refresh credentials',
    async (error) => {
      refresh.mockRejectedValueOnce(error);
      const response = await post('/refresh', {}, 'old-refresh');
      expect(response.status).toBe(401);
      assertCleared(response.headers);
    },
  );

  it('does not clear cookies for an unexpected transient refresh failure', async () => {
    refresh.mockRejectedValueOnce(new Error('fixture database unavailable'));
    const response = await post('/refresh', {}, 'old-refresh');
    expect(response.status).toBe(500);
    expect(readJsonObject(readJsonObject(response.body).error).code).toBe('INTERNAL_SERVER_ERROR');
    expect(cookieHeaders(response.headers)).toHaveLength(0);
  });

  it('revokes the current refresh session on logout and clears cookies', async () => {
    const response = await post('/logout', {}, 'old-refresh');
    expect(response.status).toBe(204);
    expect(logout).toHaveBeenCalledWith({ refreshToken: 'old-refresh', reason: 'LOGOUT' });
    assertCleared(response.headers);
  });

  it('requires a bearer token for global logout and revokes sessions for the authenticated user', async () => {
    expect((await post('/logout-all')).status).toBe(401);
    expect(logoutAll).not.toHaveBeenCalled();
    const response = await post('/logout-all', {}, 'old-refresh', true);
    expect(response.status).toBe(204);
    expect(logoutAll).toHaveBeenCalledWith(userId);
    assertCleared(response.headers);
  });

  it('returns only public authenticated user fields and requires bearer authentication', async () => {
    await request(fixture.server)
      .get(route + '/me')
      .expect(401);
    const response = await request(fixture.server)
      .get(route + '/me')
      .set('Authorization', 'Bearer fixture')
      .expect(200);
    expect(readJsonObject(response.body).data).toEqual({
      id: userId,
      name: 'Fixture',
      email: 'owner@example.invalid',
      emailVerified: true,
      selectedPlanPriceId: null,
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('lists sessions with the authenticated identity and current session only', async () => {
    await request(fixture.server)
      .get(route + '/sessions')
      .expect(401);
    await request(fixture.server)
      .get(route + '/sessions')
      .set('Authorization', 'Bearer fixture')
      .expect(200);
    expect(sessions).toHaveBeenCalledWith(userId, itemId);
  });

  it.each([itemId, organizationId])(
    'revokes a scoped session and clears cookies only for the current session',
    async (sessionId) => {
      const session = await csrf('old-refresh');
      const response = await request(fixture.server)
        .delete(route + '/sessions/' + sessionId)
        .set('Origin', origin)
        .set('Cookie', session.cookie)
        .set('X-CSRF-Token', session.token)
        .set('Authorization', 'Bearer fixture')
        .expect(204);
      expect(revoke).toHaveBeenCalledWith(userId, sessionId);
      if (sessionId === itemId) {
        assertCleared(response.headers);
      } else {
        expect(cookieHeaders(response.headers)).toHaveLength(0);
      }
    },
  );

  it('rejects an invalid session UUID without executing revocation', async () => {
    const session = await csrf();
    await request(fixture.server)
      .delete(route + '/sessions/invalid')
      .set('Origin', origin)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.token)
      .set('Authorization', 'Bearer fixture')
      .expect(400);
    expect(revoke).not.toHaveBeenCalled();
  });

  it.each(['/forgot-password', '/resend-verification'])(
    'returns the same generic email response for %s',
    async (path) => {
      const response = await post(path, { email: ' OWNER@EXAMPLE.COM ' });
      expect(response.status).toBe(202);
      expect(readJsonObject(response.body).data).toEqual(message);
      expect(path === '/forgot-password' ? forgot : resend).toHaveBeenCalledWith(email);
    },
  );

  it('verifies a valid action token and replaces the refresh session', async () => {
    const response = await post('/verify-email', { token: actionToken }, 'old-refresh');
    expect(response.status).toBe(200);
    expect(verify).toHaveBeenCalledWith({
      token: actionToken,
      userAgent: 'fixture-agent',
      previousRefreshToken: 'old-refresh',
    });
    assertTokenResponse(response);
  });

  it('rejects malformed verification tokens before the use case', async () => {
    expect((await post('/verify-email', { token: 'invalid' })).status).toBe(400);
    expect(verify).not.toHaveBeenCalled();
  });

  it('resets the password and clears cookies only after success', async () => {
    const response = await post('/reset-password', { token: actionToken, password }, 'old-refresh');
    expect(response.status).toBe(204);
    expect(reset).toHaveBeenCalledWith(actionToken, password);
    assertCleared(response.headers);
    expect((await post('/reset-password', { token: actionToken, password: 'weak' })).status).toBe(400);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('logs in with Google using trusted context and an optional plan selection', async () => {
    const response = await post('/google', { credential: 'fixture-google-credential' }, 'old-refresh');
    expect(response.status).toBe(200);
    expect(google).toHaveBeenCalledWith(
      asymmetric.objectContaining({
        credential: 'fixture-google-credential',
        selectedPlanPriceId: null,
        previousRefreshToken: 'old-refresh',
        userAgent: 'fixture-agent',
        ipAddress: asymmetric.any(String),
      }),
    );
    assertTokenResponse(response);
  });

  it('links Google only for the authenticated user and refuses spoofed identity fields', async () => {
    expect((await post('/google/link', { credential: 'fixture' })).status).toBe(401);
    expect(
      (await post('/google/link', { credential: 'fixture', userId: organizationId }, undefined, true)).status,
    ).toBe(400);
    expect(link).not.toHaveBeenCalled();
    expect((await post('/google/link', { credential: 'fixture' }, undefined, true)).status).toBe(204);
    expect(link).toHaveBeenCalledWith({ userId, email: 'owner@example.invalid', credential: 'fixture' });
  });

  it('lists authentication providers only for an authenticated user', async () => {
    await request(fixture.server)
      .get(route + '/identities')
      .expect(401);
    const response = await request(fixture.server)
      .get(route + '/identities')
      .set('Authorization', 'Bearer fixture')
      .expect(200);
    expect(readJsonObject(response.body).data).toEqual({ providers: ['PASSWORD'] });
    expect(identities).toHaveBeenCalledWith(userId);
  });
});
