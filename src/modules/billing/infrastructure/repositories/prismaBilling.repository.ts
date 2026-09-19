import { Injectable } from '@nestjs/common';

import { OrganizationRole, SubscriptionStatus } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { SubscriptionProps } from '../../domain/entities/subscription.entity.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import {
  AvailablePrice,
  BillingCustomerProps,
  BillingRepository,
  CheckoutAttemptState,
  InvoicePageParams,
  RemoteInvoiceView,
  SaveSnapshotParams,
} from '../../domain/repositories/billing.repository.js';

@Injectable()
export class PrismaBillingRepository extends BillingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async assertMember(organizationId: string, userId: string): Promise<void> {
    const member = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId, userId },
      },
      select: { id: true },
    });

    if (member === null) {
      throw new BillingError('ORGANIZATION_NOT_FOUND');
    }
  }

  async assertOwner(organizationId: string, userId: string): Promise<void> {
    const member = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId, userId },
      },
      select: {
        role: true,
        organization: {
          select: { ownerId: true },
        },
        user: {
          select: { emailVerifiedAt: true },
        },
      },
    });

    if (member === null) {
      throw new BillingError('ORGANIZATION_NOT_FOUND');
    }

    if (member.role !== OrganizationRole.OWNER || member.organization.ownerId !== userId) {
      throw new BillingError('OWNER_REQUIRED');
    }

    if (member.user.emailVerifiedAt === null) {
      throw new BillingError('EMAIL_NOT_VERIFIED');
    }
  }

  async customer(organizationId: string): Promise<BillingCustomerProps> {
    const customer = await this.prisma.billingCustomer.findUnique({
      where: { organizationId },
    });

    if (customer === null) {
      throw new BillingError('ORGANIZATION_NOT_FOUND');
    }

    return customer;
  }

  async customerByStripeId(stripeCustomerId: string): Promise<BillingCustomerProps | null> {
    return this.prisma.billingCustomer.findUnique({
      where: { stripeCustomerId },
    });
  }

  async markCustomerCreation(id: string, now: Date): Promise<void> {
    await this.prisma.billingCustomer.updateMany({
      where: { id, creationRequestedAt: null },
      data: { creationRequestedAt: now },
    });
  }

  async setCustomerId(id: string, stripeCustomerId: string): Promise<void> {
    const result = await this.prisma.billingCustomer.updateMany({
      where: {
        id,
        OR: [{ stripeCustomerId: null }, { stripeCustomerId }],
      },
      data: { stripeCustomerId },
    });

    if (result.count !== 1) {
      throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
    }
  }

  async availablePrice(id: string): Promise<AvailablePrice> {
    const price = await this.prisma.planPrice.findFirst({
      where: {
        id,
        published: true,
        stripeActive: true,
        plan: {
          published: true,
          stripeActive: true,
        },
      },
      select: {
        id: true,
        stripePriceId: true,
        amountInCents: true,
        currency: true,
        interval: true,
        intervalCount: true,
        plan: {
          select: { stripeProductId: true },
        },
      },
    });

    if (price === null) {
      throw new BillingError('PLAN_UNAVAILABLE');
    }

    return {
      id: price.id,
      stripePriceId: price.stripePriceId,
      stripeProductId: price.plan.stripeProductId,
      amountInCents: price.amountInCents,
      currency: price.currency,
      interval: price.interval,
      intervalCount: price.intervalCount,
    };
  }

  async currentSubscription(organizationId: string): Promise<SubscriptionProps | null> {
    const ongoing = await this.prisma.subscription.findMany({
      where: {
        organizationId,
        status: {
          notIn: [SubscriptionStatus.CANCELED, SubscriptionStatus.INCOMPLETE_EXPIRED],
        },
      },
      orderBy: [{ stripeCreatedAt: 'desc' }, { id: 'desc' }],
      take: 2,
    });

    if (ongoing.length > 1) {
      throw new BillingError('MULTIPLE_SUBSCRIPTIONS');
    }

    if (ongoing.length === 1) {
      return ongoing[0];
    }

    return this.prisma.subscription.findFirst({
      where: { organizationId },
      orderBy: [{ stripeCreatedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async pendingCheckout(organizationId: string): Promise<CheckoutAttemptState | null> {
    return this.prisma.checkoutAttempt.findUnique({
      where: { activeOrganizationId: organizationId },
    });
  }

  async createCheckout(params: Omit<CheckoutAttemptState, 'stripeSessionId'>): Promise<CheckoutAttemptState> {
    return this.prisma.checkoutAttempt.create({
      data: {
        ...params,
        activeOrganizationId: params.organizationId,
      },
    });
  }

  async attachCheckout(id: string, stripeSessionId: string): Promise<void> {
    await this.prisma.checkoutAttempt.update({
      where: { id },
      data: { stripeSessionId },
    });
  }

  async closeCheckout(id: string, status: 'COMPLETE' | 'EXPIRED'): Promise<void> {
    await this.prisma.checkoutAttempt.update({
      where: { id },
      data: {
        status,
        activeOrganizationId: null,
      },
    });
  }

  async saveSnapshot(params: SaveSnapshotParams): Promise<void> {
    const { organizationId, snapshot, checkout, nextReconcileAt, invoiceHistorySyncedAt } = params;

    const priceIds = [...new Set(snapshot.subscriptions.map((item) => item.stripePriceId))];

    const prices = await this.prisma.planPrice.findMany({
      where: {
        stripePriceId: { in: priceIds },
      },
      select: {
        id: true,
        stripePriceId: true,
      },
    });

    const priceMap = new Map(prices.map((price) => [price.stripePriceId, price.id]));

    for (const subscription of snapshot.subscriptions) {
      if (!priceMap.has(subscription.stripePriceId)) {
        throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
      }
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "Organization"
          WHERE "id" = ${organizationId}::uuid
          FOR UPDATE
        `;

        const subscriptions = new Map<string, string>();

        for (const remote of snapshot.subscriptions) {
          const planPriceId = priceMap.get(remote.stripePriceId);

          if (planPriceId === undefined) {
            throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
          }

          const { stripePriceId: _stripePriceId, ...state } = remote;

          const existing = await tx.subscription.findUnique({
            where: {
              stripeSubscriptionId: remote.stripeSubscriptionId,
            },
            select: {
              organizationId: true,
            },
          });

          if (existing !== null && existing.organizationId !== organizationId) {
            throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
          }

          const subscription = await tx.subscription.upsert({
            where: {
              stripeSubscriptionId: remote.stripeSubscriptionId,
            },
            create: {
              ...state,
              organizationId,
              planPriceId,
              lastSyncedAt: new Date(),
            },
            update: {
              ...state,
              planPriceId,
              lastSyncedAt: new Date(),
            },
            select: {
              id: true,
            },
          });

          subscriptions.set(remote.stripeSubscriptionId, subscription.id);
        }

        for (const remote of snapshot.invoices) {
          const subscriptionId = subscriptions.get(remote.stripeSubscriptionId);

          if (subscriptionId === undefined) {
            continue;
          }

          const { stripeSubscriptionId: _stripeSubscriptionId, paidThrough, ...state } = remote;

          const existingInvoice = await tx.billingInvoice.findUnique({
            where: {
              stripeInvoiceId: remote.stripeInvoiceId,
            },
            select: {
              organizationId: true,
              subscriptionId: true,
            },
          });

          if (
            existingInvoice !== null &&
            (existingInvoice.organizationId !== organizationId || existingInvoice.subscriptionId !== subscriptionId)
          ) {
            throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
          }

          await tx.billingInvoice.upsert({
            where: {
              stripeInvoiceId: remote.stripeInvoiceId,
            },
            create: {
              ...state,
              organizationId,
              subscriptionId,
            },
            update: state,
          });

          if (remote.status === 'paid' && paidThrough !== null) {
            await tx.subscription.updateMany({
              where: {
                id: subscriptionId,
                OR: [{ paidThrough: null }, { paidThrough: { lt: paidThrough } }],
              },
              data: {
                paidThrough,
              },
            });
          }
        }

        if (snapshot.deletedInvoiceIds?.length) {
          await tx.billingInvoice.updateMany({
            where: {
              organizationId,
              stripeInvoiceId: {
                in: snapshot.deletedInvoiceIds,
              },
            },
            data: {
              status: 'deleted',
            },
          });
        }

        if (checkout !== undefined) {
          const closed = await tx.checkoutAttempt.updateMany({
            where: {
              id: checkout.id,
              organizationId,
              status: 'PENDING',
            },
            data: {
              stripeSessionId: checkout.stripeSessionId,
              status: checkout.status,
              activeOrganizationId: null,
            },
          });

          if (closed.count !== 1) {
            throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
          }
        }

        if (nextReconcileAt !== undefined || invoiceHistorySyncedAt !== undefined) {
          await tx.billingCustomer.update({
            where: {
              organizationId,
            },
            data: {
              nextReconcileAt,
              invoiceHistorySyncedAt,
            },
          });
        }
      },
      {
        timeout: 30000,
      },
    );
  }

  async invoices(params: InvoicePageParams): Promise<{ items: RemoteInvoiceView[]; nextCursor: string | null }> {
    const { organizationId, cursor, limit } = params;

    const anchor = cursor
      ? await this.prisma.billingInvoice.findFirst({
          where: { id: cursor, organizationId },
          select: { id: true, stripeCreatedAt: true },
        })
      : null;

    if (cursor !== undefined && anchor === null) {
      throw new BillingError('INVALID_CURSOR');
    }

    const rows = await this.prisma.billingInvoice.findMany({
      where: {
        organizationId,
        ...(anchor
          ? {
              OR: [
                { stripeCreatedAt: { lt: anchor.stripeCreatedAt } },
                {
                  stripeCreatedAt: anchor.stripeCreatedAt,
                  id: { lt: anchor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ stripeCreatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        number: true,
        status: true,
        currency: true,
        amountDue: true,
        amountPaid: true,
        hostedInvoiceUrl: true,
        invoicePdf: true,
        paidAt: true,
        stripeCreatedAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async customerPage(cursor?: string): Promise<Array<{ organizationId: string; id: string }>> {
    return this.prisma.billingCustomer.findMany({
      where: {
        stripeCustomerId: { not: null },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: 100,
      select: { id: true, organizationId: true },
    });
  }

  async dueCustomers(): Promise<Array<{ organizationId: string }>> {
    return this.prisma.billingCustomer.findMany({
      where: {
        stripeCustomerId: { not: null },
        nextReconcileAt: { lte: new Date() },
      },
      orderBy: [{ nextReconcileAt: 'asc' }, { id: 'asc' }],
      take: 1,
      select: {
        organizationId: true,
      },
    });
  }

  async postponeReconciliation(organizationId: string): Promise<void> {
    await this.prisma.billingCustomer.update({
      where: {
        organizationId,
      },
      data: {
        nextReconcileAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
  }

  async notificationContext(organizationId: string, stripeObjectId: string) {
    const row = await this.prisma.organization.findUnique({
      where: {
        id: organizationId,
      },
      select: {
        name: true,
        owner: {
          select: {
            email: true,
            disabledAt: true,
            emailVerifiedAt: true,
          },
        },
        billingInvoices: {
          where: {
            stripeInvoiceId: stripeObjectId,
          },
          select: {
            status: true,
            amountDue: true,
            amountPaid: true,
          },
          take: 1,
        },
        subscriptions: {
          where: {
            stripeSubscriptionId: stripeObjectId,
          },
          select: {
            status: true,
          },
          take: 1,
        },
      },
    });

    if (row === null) {
      return null;
    }

    const invoice = row.billingInvoices[0];

    return {
      organizationName: row.name,
      recipient: row.owner.email,
      recipientEnabled: row.owner.disabledAt === null && row.owner.emailVerifiedAt !== null,
      invoiceStatus: invoice?.status ?? null,
      amountRemaining: invoice === undefined ? 0 : invoice.amountDue - invoice.amountPaid,
      subscriptionStatus: row.subscriptions[0]?.status ?? null,
    };
  }

  async entitlements(
    organizationId: string,
    userId: string,
  ): Promise<{ maxUsers: number; teamManagementEnabled: boolean; memberCount: number; isOwner: boolean }> {
    const subscription = await this.currentSubscription(organizationId);

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: {
        id: organizationId,
      },
      select: {
        ownerId: true,
        _count: {
          select: {
            organizationMembers: true,
          },
        },
      },
    });

    const price =
      subscription === null
        ? null
        : await this.prisma.planPrice.findUniqueOrThrow({
            where: {
              id: subscription.planPriceId,
            },
            select: {
              plan: {
                select: {
                  maxUsers: true,
                  teamManagementEnabled: true,
                },
              },
            },
          });

    return {
      maxUsers: price?.plan.maxUsers ?? 0,
      teamManagementEnabled: price?.plan.teamManagementEnabled ?? false,
      memberCount: organization._count.organizationMembers,
      isOwner: organization.ownerId === userId,
    };
  }

  async pendingInvoiceIds(organizationId: string): Promise<string[]> {
    const rows = await this.prisma.billingInvoice.findMany({
      where: {
        organizationId,
        status: {
          in: ['draft', 'open', 'uncollectible'],
        },
      },
      select: {
        stripeInvoiceId: true,
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 20,
    });

    return rows.map((row) => row.stripeInvoiceId);
  }
}
