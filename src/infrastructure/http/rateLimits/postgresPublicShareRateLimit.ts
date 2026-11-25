import { HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

import { hmacSha256 } from '../../../shared/security/hmac.js';
import type { PrismaService } from '../../database/prisma.service.js';

type PublicShareRateLimitScope = 'quote-share' | 'work-order-share';

const REQUEST_LIMIT = 60;

export class PostgresPublicShareRateLimit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secret: string,
    private readonly scope: PublicShareRateLimitScope,
  ) {}

  async check(ip: string, response: Response): Promise<void> {
    const key = hmacSha256(this.secret, `${this.scope}:${ip}`, 'hex');

    const rows = await this.prisma.$queryRaw<Array<{ count: number; expiresAt: Date }>>`
      INSERT INTO "QuoteShareRateLimit" (
        "key",
        "count",
        "expiresAt"
      )
      VALUES (
        ${key},
        1,
        CURRENT_TIMESTAMP + INTERVAL '1 minute'
      )
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "QuoteShareRateLimit"."expiresAt" <= CURRENT_TIMESTAMP
            THEN 1
          ELSE LEAST(
            "QuoteShareRateLimit"."count" + 1,
            ${REQUEST_LIMIT + 1}::integer
          )
        END,
        "expiresAt" = CASE
          WHEN "QuoteShareRateLimit"."expiresAt" <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + INTERVAL '1 minute'
          ELSE "QuoteShareRateLimit"."expiresAt"
        END
      RETURNING "count", "expiresAt"
    `;

    const row = rows[0];

    if (row === undefined) {
      throw new Error('Public share rate limiter returned no result');
    }

    if (row.count > REQUEST_LIMIT) {
      const retryAfter = Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000));

      response.setHeader('Retry-After', String(retryAfter));

      throw new HttpException('Too many requests.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  cleanup(): Promise<number> {
    return this.prisma.$executeRaw`
      WITH candidates AS (
        SELECT "key"
        FROM "QuoteShareRateLimit"
        WHERE "expiresAt" < CURRENT_TIMESTAMP - INTERVAL '1 day'
        ORDER BY "expiresAt", "key"
        LIMIT 1000
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM "QuoteShareRateLimit" rate
      USING candidates
      WHERE rate."key" = candidates."key"
    `;
  }
}
