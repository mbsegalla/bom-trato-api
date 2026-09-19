import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PrismaNotificationOutbox } from '../../../notifications/infrastructure/repositories/prismaNotificationOutbox.js';
import { BillingSuccessNotificationUnitOfWork } from '../../application/ports/prismaBillingSuccessNotificationUnitOfWork.port.js';
import type { BillingSuccessNotificationTransaction } from '../../application/types/billing.types.js';

@Injectable()
export class PrismaBillingSuccessNotificationUnitOfWork extends BillingSuccessNotificationUnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: PrismaNotificationOutbox,
  ) {
    super();
  }

  run(operation: (tx: BillingSuccessNotificationTransaction) => Promise<void>): Promise<boolean> {
    return this.prisma.$transaction(
      async (db) => {
        const invoices = await db.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "BillingInvoice"
          WHERE "status" = 'paid'
            AND "paymentNotificationHandledAt" IS NULL
          ORDER BY "paidAt", "id"
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `;

        const invoiceId = invoices[0]?.id;

        if (invoiceId !== undefined) {
          const invoice = await db.billingInvoice.findUniqueOrThrow({
            where: { id: invoiceId },
            select: {
              id: true,
              stripeInvoiceId: true,
              billingReason: true,
              number: true,
              amountPaid: true,
              currency: true,
              paidAt: true,
              subscription: {
                select: {
                  status: true,
                },
              },
              organization: {
                select: {
                  name: true,
                  owner: {
                    select: {
                      email: true,
                      disabledAt: true,
                      emailVerifiedAt: true,
                    },
                  },
                },
              },
            },
          });

          const owner = invoice.organization.owner;

          await operation({
            notificationOutbox: this.outbox.using(db),
            BillingSuccessNotification: {
              kind: 'INVOICE',
              id: invoice.id,
              stripeInvoiceId: invoice.stripeInvoiceId,
              billingReason: invoice.billingReason,
              number: invoice.number,
              amountPaid: invoice.amountPaid,
              currency: invoice.currency,
              paidAt: invoice.paidAt,
              subscriptionStatus: invoice.subscription.status,
              recipient: {
                organizationName: invoice.organization.name,
                email: owner.email,
                enabled: owner.disabledAt === null && owner.emailVerifiedAt !== null,
              },
            },
          });

          await db.billingInvoice.update({
            where: { id: invoice.id },
            data: {
              paymentNotificationHandledAt: new Date(),
            },
          });

          return true;
        }

        const changes = await db.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "PlanChange"
          WHERE "status" = 'APPLIED'
            AND "appliedNotificationHandledAt" IS NULL
          ORDER BY "createdAt", "id"
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `;

        const changeId = changes[0]?.id;

        if (changeId === undefined) {
          return false;
        }

        const change = await db.planChange.findUniqueOrThrow({
          where: { id: changeId },
          select: {
            id: true,
            updatedAt: true,
            targetPlanPrice: {
              select: {
                plan: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            organization: {
              select: {
                name: true,
                owner: {
                  select: {
                    email: true,
                    disabledAt: true,
                    emailVerifiedAt: true,
                  },
                },
              },
            },
          },
        });

        const owner = change.organization.owner;

        await operation({
          notificationOutbox: this.outbox.using(db),
          BillingSuccessNotification: {
            kind: 'PLAN_CHANGE',
            id: change.id,
            planName: change.targetPlanPrice.plan.name,
            appliedAt: change.updatedAt,
            recipient: {
              organizationName: change.organization.name,
              email: owner.email,
              enabled: owner.disabledAt === null && owner.emailVerifiedAt !== null,
            },
          },
        });

        await db.planChange.update({
          where: { id: change.id },
          data: {
            appliedNotificationHandledAt: new Date(),
          },
        });

        return true;
      },
      {
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }
}
