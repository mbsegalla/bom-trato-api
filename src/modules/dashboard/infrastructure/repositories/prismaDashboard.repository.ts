import type { Prisma } from '../../../../generated/prisma/client.js';
import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import type { DashboardRepository } from '../../application/ports/dashboardRepository.port.js';
import type {
  DashboardFinancialData,
  DashboardFinancialTrendData,
  DashboardSummaryData,
  DashboardUpcomingData,
} from '../../application/types/dashboard.types.js';
import type { DashboardPeriodProps } from '../../domain/valueObjects/dashboardPeriod.valueObject.js';
import { toDashboardNumber } from '../mappers/dashboardNumber.mapper.js';

interface SummaryRow {
  draftQuotes: string;
  awaitingApprovalQuotes: string;
  expiredSentQuotes: string;
  openWorkOrders: string;
  scheduledWorkOrders: string;
  inProgressWorkOrders: string;
  completedWorkOrders: string;
}

interface CurrentReceivablesRow {
  pendingCount: string;
  pendingAmountInCents: string;
  overdueCount: string;
  overdueAmountInCents: string;
}

interface PeriodReceiptsRow {
  count: string;
  amountInCents: string;
}

interface FinancialTrendRow {
  periodStart: Date;
  count: string;
  amountInCents: string;
}

export class PrismaDashboardRepository implements DashboardRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly organizationId: string,
  ) {}

  async summary(period: DashboardPeriodProps, now: Date): Promise<DashboardSummaryData> {
    const rows = await this.db.$queryRaw<SummaryRow[]>`
      WITH quote_counts AS (
        SELECT
          (
            COUNT(*) FILTER (
              WHERE "status" = 'DRAFT'
            )
          )::text AS "draftQuotes",

          (
            COUNT(*) FILTER (
              WHERE "status" = 'SENT'
                AND (
                  "validUntil" IS NULL
                  OR "validUntil" > ${now}
                )
            )
          )::text AS "awaitingApprovalQuotes",

          (
            COUNT(*) FILTER (
              WHERE "status" = 'SENT'
                AND "validUntil" <= ${now}
            )
          )::text AS "expiredSentQuotes"

        FROM "Quote"
        WHERE "organizationId" = ${this.organizationId}::uuid
      ),

      work_order_counts AS (
        SELECT
          (
            COUNT(*) FILTER (
              WHERE "status" = 'OPEN'
            )
          )::text AS "openWorkOrders",

          (
            COUNT(*) FILTER (
              WHERE "status" = 'SCHEDULED'
            )
          )::text AS "scheduledWorkOrders",

          (
            COUNT(*) FILTER (
              WHERE "status" = 'IN_PROGRESS'
            )
          )::text AS "inProgressWorkOrders",

          (
            COUNT(*) FILTER (
              WHERE "status" = 'COMPLETED'
                AND "completedAt" >= ${period.from}
                AND "completedAt" < ${period.to}
            )
          )::text AS "completedWorkOrders"

        FROM "WorkOrder"
        WHERE "organizationId" = ${this.organizationId}::uuid
      )

      SELECT *
      FROM quote_counts
      CROSS JOIN work_order_counts
    `;

    const row = rows[0];

    if (row === undefined) {
      throw new Error('Dashboard summary returned no aggregate row');
    }

    return {
      quotes: {
        draft: toDashboardNumber(row.draftQuotes),
        awaitingApproval: toDashboardNumber(row.awaitingApprovalQuotes),
        expiredSent: toDashboardNumber(row.expiredSentQuotes),
      },
      workOrders: {
        open: toDashboardNumber(row.openWorkOrders),
        scheduled: toDashboardNumber(row.scheduledWorkOrders),
        inProgress: toDashboardNumber(row.inProgressWorkOrders),
        completedInPeriod: toDashboardNumber(row.completedWorkOrders),
      },
    };
  }

  async financial(period: DashboardPeriodProps, now: Date): Promise<DashboardFinancialData> {
    const currentRows = await this.db.$queryRaw<CurrentReceivablesRow[]>`
        SELECT
          COUNT(*)::text AS "pendingCount",

          COALESCE(
            SUM(
              "amountInCents"::bigint - "receivedInCents"::bigint
            ),
            0
          )::text AS "pendingAmountInCents",

          (
            COUNT(*) FILTER (
              WHERE "dueAt" < ${now}
            )
          )::text AS "overdueCount",

          COALESCE(
            SUM(
              "amountInCents"::bigint - "receivedInCents"::bigint
            ) FILTER (
              WHERE "dueAt" < ${now}
            ),
            0
          )::text AS "overdueAmountInCents"

        FROM "Receivable"
        WHERE "organizationId" = ${this.organizationId}::uuid
          AND "currency" = 'brl'
          AND "status" IN ('OPEN', 'PARTIALLY_PAID')
      `;

    const receiptRows = await this.db.$queryRaw<PeriodReceiptsRow[]>`
      SELECT
        COUNT(*)::text AS "count",
        COALESCE(
          SUM(payment."amountInCents"::bigint),
          0
        )::text AS "amountInCents"

      FROM "ReceivablePayment" AS payment
      INNER JOIN "Receivable" AS receivable
        ON receivable."id" = payment."receivableId"

      WHERE receivable."organizationId" = ${this.organizationId}::uuid
        AND receivable."currency" = 'brl'
        AND payment."reversedAt" IS NULL
        AND payment."receivedAt" >= ${period.from}
        AND payment."receivedAt" < ${period.to}
    `;

    const current = currentRows[0];
    const receipts = receiptRows[0];

    if (current === undefined || receipts === undefined) {
      throw new Error('Dashboard financial query returned no aggregate row');
    }

    return {
      currentReceivables: {
        pendingCount: toDashboardNumber(current.pendingCount),
        pendingAmountInCents: toDashboardNumber(current.pendingAmountInCents),
        overdueCount: toDashboardNumber(current.overdueCount),
        overdueAmountInCents: toDashboardNumber(current.overdueAmountInCents),
      },
      periodReceipts: {
        count: toDashboardNumber(receipts.count),
        amountInCents: toDashboardNumber(receipts.amountInCents),
      },
    };
  }

  async financialTrend(period: DashboardPeriodProps): Promise<DashboardFinancialTrendData> {
    const rows = await this.db.$queryRaw<FinancialTrendRow[]>`
      WITH month_series AS (
        SELECT
          generate_series(
            ${period.from}::timestamptz,
            ${period.to}::timestamptz - INTERVAL '1 microsecond',
            INTERVAL '1 month'
          ) AS "periodStart"
      ),
  
      filtered_payments AS (
        SELECT
          payment."receivedAt",
          payment."amountInCents"
  
        FROM "Receivable" AS receivable
  
        INNER JOIN "ReceivablePayment" AS payment
          ON payment."receivableId" = receivable."id"
  
        WHERE receivable."organizationId" = ${this.organizationId}::uuid
          AND receivable."currency" = 'brl'
          AND payment."reversedAt" IS NULL
          AND payment."receivedAt" >= ${period.from}
          AND payment."receivedAt" < ${period.to}
      )
  
      SELECT
        month_series."periodStart",
  
        COUNT(filtered_payments."receivedAt")::text AS "count",
  
        COALESCE(
          SUM(filtered_payments."amountInCents"::bigint),
          0
        )::text AS "amountInCents"
  
      FROM month_series
  
      LEFT JOIN filtered_payments
        ON filtered_payments."receivedAt" >= month_series."periodStart"
        AND filtered_payments."receivedAt" < LEAST(
          month_series."periodStart" + INTERVAL '1 month',
          ${period.to}::timestamptz
        )
  
      GROUP BY month_series."periodStart"
  
      ORDER BY month_series."periodStart" ASC
    `;

    return {
      items: rows.map((row) => ({
        periodStart: row.periodStart,
        count: toDashboardNumber(row.count),
        amountInCents: toDashboardNumber(row.amountInCents),
      })),
    };
  }

  async upcomingWorkOrders(now: Date, limit: number): Promise<DashboardUpcomingData> {
    const rows = await this.db.workOrder.findMany({
      where: {
        organizationId: this.organizationId,
        status: WorkOrderStatus.SCHEDULED,
        scheduledStartAt: {
          gte: now,
        },
      },
      select: {
        id: true,
        customerId: true,
        customerName: true,
        title: true,
        serviceAddress: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        assignedTo: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ scheduledStartAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });

    return {
      items: rows.slice(0, limit),
      hasMore: rows.length > limit,
    };
  }
}
