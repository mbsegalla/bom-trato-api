import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { hmacSha256 } from '../../../../shared/security/hmac.js';
import { normalizeEmail } from '../../../../shared/text/email.js';

type RateWindow = readonly [limit: number, seconds: number];

interface EndpointLimits {
  ip: RateWindow;
  email?: RateWindow;
  cooldown?: RateWindow;
}

const globalLimit: RateWindow = [600, 60];
const fallbackLimits: EndpointLimits = { ip: [20, 60], email: [10, 900] };
const endpointLimits: Readonly<Record<string, EndpointLimits>> = {
  csrf: { ip: [300, 60] },
  register: { ip: [20, 60], email: [3, 3600] },
  login: { ip: [60, 60], email: [10, 900] },
  refresh: { ip: [120, 60] },
  logout: { ip: [120, 60] },
  'logout-all': { ip: [60, 60] },
  me: { ip: [120, 60] },
  sessions: { ip: [120, 60] },
  revokeSession: { ip: [60, 60] },
  'forgot-password': { ip: [30, 60], email: [5, 3600], cooldown: [1, 60] },
  'resend-verification': { ip: [30, 60], email: [5, 3600], cooldown: [1, 60] },
  'verify-email': { ip: [60, 60] },
  'reset-password': { ip: [30, 60] },
  'google-login': { ip: [30, 60] },
  identities: { ip: [120, 60] },
  'google-link': { ip: [20, 60] },
};

export class PostgresAuthRateLimit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secret: string,
  ) {}

  private async consume(identity: string, limit: number, seconds: number, response: Response): Promise<void> {
    const key = hmacSha256(this.secret, identity, 'hex');

    const rows = await this.prisma.$queryRaw<{ count: number; expiresAt: Date }[]>`
      INSERT INTO "AuthRateLimit" ("key", "count", "expiresAt")
      VALUES (
        ${key},
        1,
        CURRENT_TIMESTAMP + ${seconds} * INTERVAL '1 second'
      )
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "AuthRateLimit"."expiresAt" <= CURRENT_TIMESTAMP
            THEN 1
          ELSE LEAST("AuthRateLimit"."count" + 1, 1000000)
        END,
        "expiresAt" = CASE
          WHEN "AuthRateLimit"."expiresAt" <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + ${seconds} * INTERVAL '1 second'
          ELSE "AuthRateLimit"."expiresAt"
        END
      RETURNING "count", "expiresAt"
    `;

    const row = rows[0];

    if (!row) {
      throw new Error('Rate limiter returned no result');
    }

    if (row.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000));

      response.setHeader('Retry-After', String(retryAfter));

      throw new HttpException('Too many attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async check(request: Request, response: Response, bucket: string): Promise<void> {
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';

    const limits = Object.hasOwn(endpointLimits, bucket) ? endpointLimits[bucket] : fallbackLimits;

    await this.consume(`ip:${ip}`, ...globalLimit, response);
    await this.consume(`route:${bucket}:${ip}`, ...limits.ip, response);

    const body: unknown = request.body;

    if (
      limits.email &&
      typeof body === 'object' &&
      body !== null &&
      'email' in body &&
      typeof body.email === 'string' &&
      body.email.length <= 254
    ) {
      const email = normalizeEmail(body.email);

      if (limits.cooldown) {
        await this.consume(`email-cooldown:${bucket}:${email}`, ...limits.cooldown, response);
      }

      await this.consume(`email:${bucket}:${email}`, ...limits.email, response);
    }
  }
}
