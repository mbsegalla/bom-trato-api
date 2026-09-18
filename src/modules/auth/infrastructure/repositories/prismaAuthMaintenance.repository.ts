import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { AuthMaintenanceRepository } from '../../application/ports/authMaintenanceRepository.port.js';
import type { AuthCleanupParams, AuthCleanupResult } from '../../application/types/auth.types.js';

@Injectable()
export class PrismaAuthMaintenanceRepository extends AuthMaintenanceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async cleanup(params: AuthCleanupParams): Promise<AuthCleanupResult> {
    const { expiredBefore, rateLimitBefore, limit } = params;

    return this.prisma.$transaction(
      async (tx) => {
        const refreshTokens = await tx.$executeRaw`
          WITH sessions AS (
            SELECT "id"
            FROM "AuthSession"
            WHERE "absoluteExpiresAt" < ${expiredBefore}
               OR "idleExpiresAt" < ${expiredBefore}
               OR "revokedAt" < ${expiredBefore}
            ORDER BY "absoluteExpiresAt", "id"
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
          ),
          candidates AS (
            SELECT token."id"
            FROM "RefreshToken" token
            INNER JOIN sessions
              ON sessions."id" = token."sessionId"
            ORDER BY token."id"
            LIMIT ${limit}
            FOR UPDATE OF token SKIP LOCKED
          )
          DELETE FROM "RefreshToken" token
          USING candidates
          WHERE token."id" = candidates."id"
        `;

        const sessions = await tx.$executeRaw`
          WITH candidates AS (
            SELECT session."id"
            FROM "AuthSession" session
            WHERE (
              session."absoluteExpiresAt" < ${expiredBefore}
              OR session."idleExpiresAt" < ${expiredBefore}
              OR session."revokedAt" < ${expiredBefore}
            )
            AND NOT EXISTS (
              SELECT 1
              FROM "RefreshToken" token
              WHERE token."sessionId" = session."id"
            )
            ORDER BY session."absoluteExpiresAt", session."id"
            LIMIT ${limit}
            FOR UPDATE OF session SKIP LOCKED
          )
          DELETE FROM "AuthSession" session
          USING candidates
          WHERE session."id" = candidates."id"
        `;

        const actionTokens = await tx.$executeRaw`
          WITH candidates AS (
            SELECT "id"
            FROM "AuthActionToken"
            WHERE "expiresAt" < ${expiredBefore}
            ORDER BY "expiresAt", "id"
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
          )
          DELETE FROM "AuthActionToken" token
          USING candidates
          WHERE token."id" = candidates."id"
        `;

        const rateLimits = await tx.$executeRaw`
          WITH candidates AS (
            SELECT "key"
            FROM "AuthRateLimit"
            WHERE "expiresAt" < ${rateLimitBefore}
            ORDER BY "expiresAt", "key"
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
          )
          DELETE FROM "AuthRateLimit" rate
          USING candidates
          WHERE rate."key" = candidates."key"
        `;

        return {
          refreshTokens,
          sessions,
          actionTokens,
          rateLimits,
        };
      },
      {
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }
}
