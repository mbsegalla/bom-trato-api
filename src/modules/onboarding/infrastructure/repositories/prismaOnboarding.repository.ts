import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { AuthError } from '../../../auth/domain/errors/auth.error.js';
import { BillingError } from '../../../billing/domain/errors/billing.error.js';
import { OnboardingSnapshot } from '../../domain/onboardingState.js';
import { OnboardingRepository } from '../../domain/repositories/onboarding.repository.js';

@Injectable()
export class PrismaOnboardingRepository extends OnboardingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async snapshot(userId: string, organizationId?: string): Promise<OnboardingSnapshot> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
      select: {
        selectedPlanPriceId: true,
      },
    });

    // Ownership takes precedence when no organization was explicitly selected.
    const owned =
      organizationId === undefined
        ? await this.prisma.organization.findFirst({
            where: {
              ownerId: userId,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
            },
          })
        : null;

    const organization = await this.prisma.organization.findFirst({
      where: {
        id: organizationId ?? owned?.id,
        organizationMembers: {
          some: {
            userId,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        subscriptions: {
          where: {
            status: {
              notIn: ['CANCELED', 'INCOMPLETE_EXPIRED'],
            },
          },
          orderBy: [{ stripeCreatedAt: 'desc' }, { id: 'desc' }],
          take: 2,
        },
        checkoutAttempts: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
    });

    if (organization === null) {
      if (organizationId !== undefined) {
        throw new BillingError('ORGANIZATION_NOT_FOUND');
      }

      return {
        organizationId: null,
        isOwner: false,
        planPriceId: user.selectedPlanPriceId,
        priceAvailable: false,
        subscriptions: [],
        checkoutStatus: null,
      };
    }

    const checkout = organization.checkoutAttempts[0];

    // Resume the price of the existing open checkout.
    const pending = checkout?.status === 'PENDING' && checkout.expiresAt > new Date();
    const planPriceId = pending ? checkout.planPriceId : user.selectedPlanPriceId;

    const price =
      planPriceId === null
        ? null
        : await this.prisma.planPrice.findFirst({
            where: {
              id: planPriceId,
              published: true,
              stripeActive: true,
              plan: {
                published: true,
                stripeActive: true,
              },
            },
            select: {
              id: true,
            },
          });

    let checkoutStatus: OnboardingSnapshot['checkoutStatus'] = checkout?.status ?? null;

    if (checkout?.status === 'COMPLETE' && organization.subscriptions.length === 0) {
      const latest = await this.prisma.subscription.findFirst({
        where: {
          organizationId: organization.id,
        },
        orderBy: [{ stripeCreatedAt: 'desc' }, { id: 'desc' }],
        select: {
          stripeCreatedAt: true,
        },
      });

      // A terminal subscription already synchronized for this checkout
      // should not be treated as an unconfirmed payment.
      if (latest && latest.stripeCreatedAt >= checkout.createdAt) {
        checkoutStatus = null;
      }
    }

    return {
      organizationId: organization.id,
      isOwner: organization.ownerId === userId,
      planPriceId,
      priceAvailable: price !== null,
      subscriptions: organization.subscriptions,
      checkoutStatus,
    };
  }

  async selectPlan(userId: string, organizationId: string, planPriceId: string): Promise<void> {
    await this.prisma.$transaction(async (db) => {
      const organization = await db.organization.findFirst({
        where: {
          id: organizationId,
          ownerId: userId,
        },
        select: {
          id: true,
        },
      });

      if (organization === null) {
        throw new BillingError('ORGANIZATION_NOT_FOUND');
      }

      const pending = await db.checkoutAttempt.findUnique({
        where: {
          activeOrganizationId: organizationId,
        },
      });

      if (pending !== null && pending.expiresAt > new Date() && pending.planPriceId !== planPriceId) {
        throw new BillingError('CHECKOUT_IN_PROGRESS');
      }

      const price = await db.planPrice.findFirst({
        where: {
          id: planPriceId,
          published: true,
          stripeActive: true,
          plan: {
            published: true,
            stripeActive: true,
          },
        },
        select: {
          id: true,
        },
      });

      if (price === null) {
        throw new AuthError('PLAN_UNAVAILABLE');
      }

      await db.user.update({
        where: {
          id: userId,
        },
        data: {
          selectedPlanPriceId: planPriceId,
        },
      });
    });
  }
}
