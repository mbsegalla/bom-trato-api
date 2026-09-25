import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PrismaInAppNotificationRepository } from '../../../notifications/infrastructure/repositories/prismaInAppNotification.repository.js';
import { PrismaNotificationOutbox } from '../../../notifications/infrastructure/repositories/prismaNotificationOutbox.repository.js';
import { BillingSuccessNotificationUnitOfWork } from '../../application/ports/billingSuccessNotificationUnitOfWork.port.js';
import type { BillingSuccessNotificationTransaction } from '../../application/types/billing.types.js';

@Injectable()
export class PrismaBillingSuccessNotificationUnitOfWork extends BillingSuccessNotificationUnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: PrismaNotificationOutbox,
  ) {
    super();
  }

  async run(operation: (tx: BillingSuccessNotificationTransaction) => Promise<void>): Promise<boolean> {
    let notificationInserted = false;

    const onNotificationInserted = (): void => {
      notificationInserted = true;
    };

    const result = await this.prisma.$transaction(
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
            where: {
              id: invoiceId,
            },
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
                  id: true,
                  name: true,
                  owner: {
                    select: {
                      id: true,
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
            notificationOutbox: this.outbox.using(db, onNotificationInserted),
            inAppNotifications: new PrismaInAppNotificationRepository(db),
            billingSuccessNotification: {
              kind: 'INVOICE',
              id: invoice.id,
              organizationId: invoice.organization.id,
              organizationName: invoice.organization.name,
              stripeInvoiceId: invoice.stripeInvoiceId,
              billingReason: invoice.billingReason,
              number: invoice.number,
              amountPaid: invoice.amountPaid,
              currency: invoice.currency,
              paidAt: invoice.paidAt,
              subscriptionStatus: invoice.subscription.status,
              recipient: {
                userId: owner.id,
                email: owner.email,
                enabled: owner.disabledAt === null && owner.emailVerifiedAt !== null,
              },
            },
          });

          await db.billingInvoice.update({
            where: {
              id: invoice.id,
            },
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
          where: {
            id: changeId,
          },
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
                id: true,
                name: true,
                owner: {
                  select: {
                    id: true,
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
          notificationOutbox: this.outbox.using(db, onNotificationInserted),
          inAppNotifications: new PrismaInAppNotificationRepository(db),
          billingSuccessNotification: {
            kind: 'PLAN_CHANGE',
            id: change.id,
            organizationId: change.organization.id,
            organizationName: change.organization.name,
            planName: change.targetPlanPrice.plan.name,
            appliedAt: change.updatedAt,
            recipient: {
              userId: owner.id,
              email: owner.email,
              enabled: owner.disabledAt === null && owner.emailVerifiedAt !== null,
            },
          },
        });

        await db.planChange.update({
          where: {
            id: change.id,
          },
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

    if (notificationInserted) {
      this.outbox.notifyWorker();
    }

    return result;
  }
}
