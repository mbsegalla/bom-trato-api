import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { hmacSha256 } from '../../../../shared/security/hmac.js';
import { normalizeEmail } from '../../../../shared/text/email.js';

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

    await this.consume(`ip:${ip}`, 120, 60, response);

    if (bucket !== 'csrf') {
      await this.consume(`route:${bucket}:${ip}`, 20, 60, response);
    }

    const body: unknown = request.body;

    if (
      typeof body === 'object' &&
      body !== null &&
      'email' in body &&
      typeof body.email === 'string' &&
      body.email.length <= 254
    ) {
      await this.consume(`email:${bucket}:${normalizeEmail(body.email)}`, 10, 900, response);
    }
  }
}
