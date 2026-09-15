import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { BillingWebhookRepository } from '../../application/ports/billingWebhookRepository.port.js';
import { ClaimedWebhookJob, WebhookNotice, WebhookOutcome } from '../../domain/types/billingWebhook.types.js';

@Injectable()
export class PrismaBillingWebhookRepository extends BillingWebhookRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async enqueue(notice: WebhookNotice): Promise<void> {
    await this.prisma.stripeWebhookEvent.createMany({
      data: [notice],
      skipDuplicates: true,
    });
  }

  async claimEvent(leaseToken: string): Promise<ClaimedWebhookJob | null> {
    const rows = await this.prisma.$queryRaw<ClaimedWebhookJob[]>`
      WITH candidate AS (
        SELECT "id"
        FROM "StripeWebhookEvent"
        WHERE "processedAt" IS NULL
          AND "failedAt" IS NULL
          AND "nextAttemptAt" <= CURRENT_TIMESTAMP
          AND (
            "leaseToken" IS NULL
            OR "leaseExpiresAt" <= CURRENT_TIMESTAMP
          )
        ORDER BY "nextAttemptAt", "id"
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "StripeWebhookEvent" AS event
      SET
        "leaseToken" = ${leaseToken}::uuid,
        "leaseExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '2 minutes'
      FROM candidate
      WHERE event."id" = candidate."id"
      RETURNING
        event."id",
        event."type",
        event."stripeCustomerId",
        event."stripeObjectId",
        event."attempts",
        event."leaseToken"
    `;

    return rows[0] ?? null;
  }

  async renewEventLease(event: ClaimedWebhookJob): Promise<boolean> {
    const count = await this.prisma.$executeRaw`
      UPDATE "StripeWebhookEvent"
      SET "leaseExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '2 minutes'
      WHERE "id" = ${event.id}
        AND "leaseToken" = ${event.leaseToken}::uuid
        AND "leaseExpiresAt" > CURRENT_TIMESTAMP
        AND "processedAt" IS NULL
        AND "failedAt" IS NULL
    `;

    return count === 1;
  }

  async settleEvent(
    event: ClaimedWebhookJob,
    outcome: WebhookOutcome,
    code = 'WEBHOOK_PROCESSING_FAILED',
  ): Promise<boolean> {
    let changes: Prisma.Sql;

    switch (outcome) {
      case 'COMPLETE':
        changes = Prisma.sql`
          "processedAt" = CURRENT_TIMESTAMP,
          "lastErrorCode" = NULL
        `;
        break;
      case 'DEFER':
        changes = Prisma.sql`
          "nextAttemptAt" = CURRENT_TIMESTAMP + INTERVAL '15 seconds'
        `;
        break;
      case 'RETRY': {
        const seconds = Math.min(3600, 2 ** Math.min(event.attempts + 1, 12));

        changes = Prisma.sql`
          "attempts" = "attempts" + 1,
          "failedAt" = CASE
            WHEN "attempts" + 1 >= 25 THEN CURRENT_TIMESTAMP
            ELSE NULL
          END,
          "lastErrorCode" = ${code.slice(0, 100)},
          "nextAttemptAt" =
            CURRENT_TIMESTAMP + ${seconds} * INTERVAL '1 second'
        `;
        break;
      }
    }

    const count = await this.prisma.$executeRaw`
      UPDATE "StripeWebhookEvent"
      SET
        ${changes},
        "leaseToken" = NULL,
        "leaseExpiresAt" = NULL
      WHERE "id" = ${event.id}
        AND "leaseToken" = ${event.leaseToken}::uuid
        AND "leaseExpiresAt" > CURRENT_TIMESTAMP
        AND "processedAt" IS NULL
        AND "failedAt" IS NULL
    `;

    return count === 1;
  }
}
