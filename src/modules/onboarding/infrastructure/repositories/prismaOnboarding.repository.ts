import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { OrganizationRole, SubscriptionStatus } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { AuthError } from '../../../auth/domain/errors/auth.error.js';
import { Subscription } from '../../../billing/domain/entities/subscription.entity.js';
import { BillingError } from '../../../billing/domain/errors/billing.error.js';
import type {
  CompleteBusinessSetupParams,
  EnsureOnboardingOrganizationParams,
} from '../../domain/repositories/onboarding.repository.js';
import { OnboardingRepository } from '../../domain/repositories/onboarding.repository.js';
import type { OnboardingSnapshot } from '../../domain/types/onboarding.types.js';

@Injectable()
export class PrismaOnboardingRepository extends OnboardingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ensureOrganization(params: EnsureOnboardingOrganizationParams): Promise<string> {
    const { userId, email, billingName, provisionalOrganizationName } = params;

    const existing = await this.prisma.organization.findFirst({
      where: {
        ownerId: userId,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
      },
    });

    if (existing !== null) {
      return existing.id;
    }

    try {
      const organization = await this.prisma.organization.create({
        data: {
          ownerId: userId,
          name: provisionalOrganizationName,
          creationKey: userId,
          setupCompletedAt: null,
          organizationMembers: {
            create: {
              userId,
              role: OrganizationRole.OWNER,
            },
          },
          billingCustomer: {
            create: {
              billingEmail: email,
              billingName,
            },
          },
        },
        select: {
          id: true,
        },
      });

      return organization.id;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrent = await this.prisma.organization.findUnique({
          where: {
            ownerId_creationKey: {
              ownerId: userId,
              creationKey: userId,
            },
          },
          select: {
            id: true,
          },
        });

        if (concurrent !== null) {
          return concurrent.id;
        }
      }

      throw error;
    }
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
              notIn: [SubscriptionStatus.CANCELED, SubscriptionStatus.INCOMPLETE_EXPIRED],
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
        setupCompletedAt: null,
        planPriceId: user.selectedPlanPriceId,
        priceAvailable: false,
        subscriptions: [],
        checkoutStatus: null,
      };
    }

    const checkout = organization.checkoutAttempts[0];

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

      if (latest && latest.stripeCreatedAt >= checkout.createdAt) {
        checkoutStatus = null;
      }
    }

    return {
      organizationId: organization.id,
      isOwner: organization.ownerId === userId,
      setupCompletedAt: organization.setupCompletedAt,
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

  async completeBusinessSetup(params: CompleteBusinessSetupParams): Promise<void> {
    const { userId, organizationId, name } = params;

    await this.prisma.$transaction(async (db) => {
      const organization = await db.organization.findFirst({
        where: {
          id: organizationId,
          ownerId: userId,
        },
        select: {
          id: true,
          setupCompletedAt: true,
          subscriptions: {
            where: {
              status: {
                notIn: [SubscriptionStatus.CANCELED, SubscriptionStatus.INCOMPLETE_EXPIRED],
              },
            },
            orderBy: [{ stripeCreatedAt: 'desc' }, { id: 'desc' }],
            take: 2,
          },
        },
      });

      if (organization === null) {
        throw new BillingError('ORGANIZATION_NOT_FOUND');
      }

      if (organization.setupCompletedAt !== null) {
        return;
      }

      if (organization.subscriptions.length > 1) {
        throw new BillingError('MULTIPLE_SUBSCRIPTIONS');
      }

      const current = organization.subscriptions[0];

      if (current === undefined || !Subscription.restore(current).hasAccessAt(new Date())) {
        throw new BillingError('SUBSCRIPTION_REQUIRED');
      }

      const now = new Date();

      await db.organization.update({
        where: {
          id: organizationId,
        },
        data: {
          name,
          setupCompletedAt: now,
        },
      });

      await db.billingCustomer.update({
        where: {
          organizationId,
        },
        data: {
          billingName: name,
        },
      });
    });
  }
}
