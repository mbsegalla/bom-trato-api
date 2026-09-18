import { HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { hmacSha256 } from '../../../../shared/security/hmac.js';

export class PrismaQuoteShareRateLimit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secret: string,
  ) {}

  async check(ip: string, response: Response): Promise<void> {
    const key = hmacSha256(this.secret, `quote-share:${ip}`, 'hex');

    const rows = await this.prisma.$queryRaw<{ count: number; expiresAt: Date }[]>`
      WITH cleanup AS (
        DELETE FROM "QuoteShareRateLimit"
        WHERE "key" IN (
          SELECT "key"
          FROM "QuoteShareRateLimit"
          WHERE "expiresAt" < CURRENT_TIMESTAMP - INTERVAL '1 day'
          LIMIT 100
        )
        AND "expiresAt" < CURRENT_TIMESTAMP - INTERVAL '1 day'
      )
      INSERT INTO "QuoteShareRateLimit" ("key", "count", "expiresAt")
      VALUES (
        ${key},
        1,
        CURRENT_TIMESTAMP + INTERVAL '1 minute'
      )
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "QuoteShareRateLimit"."expiresAt" <= CURRENT_TIMESTAMP
            THEN 1
          ELSE LEAST("QuoteShareRateLimit"."count" + 1, 61)
        END,
        "expiresAt" = CASE
          WHEN "QuoteShareRateLimit"."expiresAt" <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + INTERVAL '1 minute'
          ELSE "QuoteShareRateLimit"."expiresAt"
        END
      RETURNING "count", "expiresAt"
    `;

    const row = rows[0];

    if (!row) {
      throw new Error('Quote share rate limiter returned no result');
    }

    if (row.count > 60) {
      const retryAfter = Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000));

      response.setHeader('Retry-After', String(retryAfter));

      throw new HttpException('Too many requests.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
