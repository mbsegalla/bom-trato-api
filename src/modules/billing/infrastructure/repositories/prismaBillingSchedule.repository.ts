import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { BillingWork } from '../events/billing.events.js';

@Injectable()
export class PrismaBillingScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async nextRunAt(work: BillingWork): Promise<Date | null> {
    switch (work) {
      case BillingWork.WEBHOOKS: {
        const rows = await this.prisma.$queryRaw<Array<{ at: Date | null }>>`
          SELECT MIN(
            CASE
              WHEN "leaseToken" IS NULL THEN "nextAttemptAt"
              ELSE GREATEST("nextAttemptAt", "leaseExpiresAt")
            END
          ) AS "at"
          FROM "StripeWebhookEvent"
          WHERE "processedAt" IS NULL
            AND "failedAt" IS NULL
        `;

        return rows[0]?.at ?? null;
      }

      case BillingWork.PLAN_CHANGES: {
        const row = await this.prisma.planChange.findFirst({
          where: {
            activeOrganizationId: { not: null },
          },
          orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }],
          select: {
            nextCheckAt: true,
          },
        });

        return row?.nextCheckAt ?? null;
      }

      case BillingWork.PAYMENT_METHOD_UPDATES: {
        const row = await this.prisma.paymentMethodUpdate.findFirst({
          where: {
            status: 'PENDING',
          },
          orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }],
          select: {
            nextCheckAt: true,
          },
        });

        return row?.nextCheckAt ?? null;
      }

      case BillingWork.RECONCILIATION: {
        const row = await this.prisma.billingCustomer.findFirst({
          where: {
            stripeCustomerId: { not: null },
          },
          orderBy: [{ nextReconcileAt: 'asc' }, { id: 'asc' }],
          select: {
            nextReconcileAt: true,
          },
        });

        return row?.nextReconcileAt ?? null;
      }

      case BillingWork.CONFIRMATIONS:
        return null;
    }
  }
}
