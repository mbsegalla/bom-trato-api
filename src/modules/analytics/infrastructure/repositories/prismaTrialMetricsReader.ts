import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readTransaction } from '../../../../infrastructure/database/prismaTransaction.js';
import { TrialMetricsReader } from '../../application/ports/trialMetricsReader.port.js';
import type {
  TrialMetricsCounts,
  TrialMetricsPeriod,
  TrialMetricsSnapshot,
  TrialNotificationMetrics,
} from '../../application/types/trialMetrics.types.js';

interface TrialMetricsRow extends TrialMetricsCounts {
  weekStart: string | null;
}

@Injectable()
export class PrismaTrialMetricsReader extends TrialMetricsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read(period: TrialMetricsPeriod): Promise<TrialMetricsSnapshot> {
    return readTransaction(this.prisma, async (db) => {
      const rows = await this.readTrialMetrics(db, period);
      const notifications = await this.readNotificationMetrics(db, period);

      const total = rows.find((row) => row.weekStart === null);

      if (total === undefined) {
        throw new Error('TRIAL_METRICS_TOTAL_NOT_FOUND');
      }

      return {
        total: this.toCounts(total),
        cohorts: rows.flatMap((row) => {
          if (row.weekStart === null) {
            return [];
          }

          return [
            {
              weekStart: row.weekStart,
              counts: this.toCounts(row),
            },
          ];
        }),
        notifications,
      };
    });
  }

  private readTrialMetrics(db: Prisma.TransactionClient, period: TrialMetricsPeriod): Promise<TrialMetricsRow[]> {
    return db.$queryRaw<TrialMetricsRow[]>`
      WITH report_period AS (
        SELECT
          ${period.from}::timestamptz AS from_at,
          ${period.toExclusive}::timestamptz AS to_at,
          ${period.asOf}::timestamptz AS as_of
      ),
      trials AS (
        SELECT
          trial."organizationId" AS organization_id,
          trial."startsAt" AS starts_at,
          trial."expiresAt" AS expires_at,
          CASE
            WHEN trial."convertedAt" <= period.as_of
            THEN trial."convertedAt"
          END AS converted_at,
          CASE
            WHEN trial."revokedAt" <= period.as_of
            THEN trial."revokedAt"
          END AS revoked_at,
          DATE_TRUNC(
            'week',
            trial."startsAt" AT TIME ZONE 'UTC'
          ) AS week_start,
          period.as_of
        FROM "OrganizationTrial" trial
        CROSS JOIN report_period period
        WHERE trial."startsAt" >= period.from_at
          AND trial."startsAt" < period.to_at
          AND trial."startsAt" <= period.as_of
      ),
      observation_periods AS (
        SELECT
          *,
          LEAST(
            expires_at,
            as_of,
            COALESCE(converted_at, as_of),
            COALESCE(revoked_at, as_of)
          ) AS usage_until
        FROM trials
      ),
      activity AS (
        SELECT
          trial.*,
          EXISTS (
            SELECT 1
            FROM "Customer" customer
            WHERE customer."organizationId" = trial.organization_id
              AND customer."createdAt" >= trial.starts_at
              AND customer."createdAt" < trial.usage_until
          ) AS created_customer,
          EXISTS (
            SELECT 1
            FROM "Quote" quote
            WHERE quote."organizationId" = trial.organization_id
              AND quote."createdAt" >= trial.starts_at
              AND quote."createdAt" < trial.usage_until
          ) AS created_quote,
          EXISTS (
            SELECT 1
            FROM "WorkOrder" work_order
            WHERE work_order."organizationId" = trial.organization_id
              AND work_order."createdAt" >= trial.starts_at
              AND work_order."createdAt" < trial.usage_until
          ) AS created_work_order,
          EXISTS (
            SELECT 1
            FROM "CheckoutAttempt" checkout
            WHERE checkout."organizationId" = trial.organization_id
              AND checkout."createdAt" >= trial.starts_at
              AND checkout."createdAt" <= trial.as_of
          ) AS started_checkout
        FROM observation_periods trial
      )
      SELECT
        TO_CHAR(week_start, 'YYYY-MM-DD') AS "weekStart",

        COUNT(*)::int AS "started",

        (
          COUNT(*) FILTER (
            WHERE organization_id IS NOT NULL
          )
        )::int AS "linkedOrganizations",

        (
          COUNT(*) FILTER (
            WHERE converted_at IS NULL
              AND revoked_at IS NULL
              AND organization_id IS NOT NULL
              AND expires_at > as_of
          )
        )::int AS "openWindow",

        (
          COUNT(*) FILTER (
            WHERE converted_at IS NULL
              AND revoked_at IS NULL
              AND organization_id IS NOT NULL
              AND expires_at <= as_of
          )
        )::int AS "expired",

        (
          COUNT(*) FILTER (
            WHERE converted_at IS NULL
              AND revoked_at IS NOT NULL
          )
        )::int AS "revoked",

        (
          COUNT(*) FILTER (
            WHERE converted_at IS NULL
              AND revoked_at IS NULL
              AND organization_id IS NULL
          )
        )::int AS "detached",

        (
          COUNT(*) FILTER (
            WHERE converted_at IS NOT NULL
          )
        )::int AS "converted",

        (
          COUNT(*) FILTER (
            WHERE converted_at < expires_at
          )
        )::int AS "convertedBeforeExpiration",

        (
          COUNT(*) FILTER (
            WHERE converted_at >= expires_at
          )
        )::int AS "convertedAfterExpiration",

        (
          COUNT(*) FILTER (
            WHERE expires_at <= as_of
          )
        )::int AS "matured",

        (
          COUNT(*) FILTER (
            WHERE expires_at <= as_of
              AND converted_at < expires_at
          )
        )::int AS "maturedConvertedBeforeExpiration",

        (
          COUNT(*) FILTER (
            WHERE created_customer
          )
        )::int AS "customersCreated",

        (
          COUNT(*) FILTER (
            WHERE created_quote
          )
        )::int AS "quotesCreated",

        (
          COUNT(*) FILTER (
            WHERE created_work_order
          )
        )::int AS "workOrdersCreated",

        (
          COUNT(*) FILTER (
            WHERE started_checkout
          )
        )::int AS "checkoutStarted"

      FROM activity

      GROUP BY GROUPING SETS (
        (),
        (week_start)
      )

      ORDER BY
        GROUPING(week_start) DESC,
        week_start ASC
    `;
  }

  private readNotificationMetrics(
    db: Prisma.TransactionClient,
    period: TrialMetricsPeriod,
  ): Promise<TrialNotificationMetrics[]> {
    return db.$queryRaw<TrialNotificationMetrics[]>`
      SELECT
        SPLIT_PART("key", '/', 3) AS "stage",

        COUNT(*)::int AS "total",

        (
          COUNT(*) FILTER (
            WHERE "status" = 'PENDING'
          )
        )::int AS "pending",

        (
          COUNT(*) FILTER (
            WHERE "status" = 'PROCESSING'
          )
        )::int AS "processing",

        (
          COUNT(*) FILTER (
            WHERE "status" = 'ACCEPTED'
          )
        )::int AS "accepted",

        (
          COUNT(*) FILTER (
            WHERE "status" = 'FAILED'
          )
        )::int AS "failed",

        (
          COUNT(*) FILTER (
            WHERE "status" = 'SKIPPED'
          )
        )::int AS "skipped"

      FROM "NotificationOutbox"

      WHERE "type" = 'TRIAL_LIFECYCLE'
        AND "createdAt" >= ${period.from}::timestamptz
        AND "createdAt" < ${period.toExclusive}::timestamptz
        AND "createdAt" <= ${period.asOf}::timestamptz

      GROUP BY SPLIT_PART("key", '/', 3)

      ORDER BY "stage" ASC
    `;
  }

  private toCounts(row: TrialMetricsRow): TrialMetricsCounts {
    return {
      started: row.started,
      linkedOrganizations: row.linkedOrganizations,
      openWindow: row.openWindow,
      expired: row.expired,
      revoked: row.revoked,
      detached: row.detached,
      converted: row.converted,
      convertedBeforeExpiration: row.convertedBeforeExpiration,
      convertedAfterExpiration: row.convertedAfterExpiration,
      matured: row.matured,
      maturedConvertedBeforeExpiration: row.maturedConvertedBeforeExpiration,
      customersCreated: row.customersCreated,
      quotesCreated: row.quotesCreated,
      workOrdersCreated: row.workOrdersCreated,
      checkoutStarted: row.checkoutStarted,
    };
  }
}
