import { randomBytes, timingSafeEqual } from 'node:crypto';

import { ForbiddenException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

import type { appConfig } from '../../../../config/app.config.js';
import type { authConfig } from '../../../../config/auth.config.js';
import { hmacSha256, sha256Hex } from '../../../../shared/security/hmac.js';

export class AuthCookies {
  readonly refreshName: string;
  private readonly csrfName: string;
  private readonly options: CookieOptions;

  constructor(
    private readonly config: ConfigType<typeof authConfig>,
    private readonly app: ConfigType<typeof appConfig>,
  ) {
    this.refreshName = app.isProduction ? '__Host-bomTratoRefresh' : 'bomTratoRefresh';
    this.csrfName = app.isProduction ? '__Host-bomTratoCsrf' : 'bomTratoCsrf';

    this.options = {
      httpOnly: true,
      secure: app.isProduction,
      sameSite: 'lax',
      path: '/',
    };
  }

  private cookie(request: Request, name: string): string {
    const cookies: unknown = request.cookies;

    if (typeof cookies !== 'object' || cookies === null || !(name in cookies)) {
      return '';
    }

    const value: unknown = Reflect.get(cookies, name);

    return typeof value === 'string' ? value : '';
  }

  refresh(request: Request): string {
    return this.cookie(request, this.refreshName);
  }

  assertOrigin(request: Request): void {
    if (request.get('origin') !== this.app.frontendUrl) {
      throw new ForbiddenException('Request origin is not allowed.');
    }
  }

  private signature(nonce: string, expires: string, refresh: string): string {
    const binding = sha256Hex(refresh || 'anonymous');

    return hmacSha256(this.config.csrfSecret, `${nonce}.${expires}.${binding}`, 'base64url');
  }

  issueCsrf(response: Response, refresh: string): string {
    const nonce = randomBytes(32).toString('base64url');
    const expires = String(Date.now() + 3600000);

    const token = `${nonce}.${expires}.` + this.signature(nonce, expires, refresh);

    response.cookie(this.csrfName, token, {
      ...this.options,
      maxAge: 3600000,
    });

    response.setHeader('Cache-Control', 'no-store');

    return token;
  }

  assertCsrf(request: Request): void {
    this.assertOrigin(request);

    const token = request.get('x-csrf-token') ?? '';
    const cookie = this.cookie(request, this.csrfName);

    if (token.length > 200 || token !== cookie) {
      throw new ForbiddenException('Invalid CSRF token.');
    }

    const [nonce, expires, signature, extra] = token.split('.');

    if (
      !nonce ||
      !expires ||
      !signature ||
      extra !== undefined ||
      !/^[A-Za-z0-9_-]{43}$/.test(nonce) ||
      !/^\d{13}$/.test(expires) ||
      Number(expires) <= Date.now()
    ) {
      throw new ForbiddenException('Invalid CSRF token.');
    }

    const expected = this.signature(nonce, expires, this.refresh(request));

    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new ForbiddenException('Invalid CSRF token.');
    }
  }

  setSession(response: Response, refresh: string, expires: Date): string {
    response.cookie(this.refreshName, refresh, {
      ...this.options,
      expires,
    });

    return this.issueCsrf(response, refresh);
  }

  clear(response: Response): void {
    response.clearCookie(this.refreshName, this.options);
    response.clearCookie(this.csrfName, this.options);
    response.setHeader('Cache-Control', 'no-store');
  }
}
