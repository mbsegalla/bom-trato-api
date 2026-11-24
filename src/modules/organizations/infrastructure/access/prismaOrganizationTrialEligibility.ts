import type { Prisma } from '../../../../generated/prisma/client.js';
import { OrganizationRole } from '../../../../generated/prisma/enums.js';
import { BillingError } from '../../../billing/domain/errors/billing.error.js';
import type { OrganizationTrialProps } from '../../domain/entities/organizationTrial.entity.js';
import type { OrganizationTrialEligibility } from '../../domain/policies/organizationTrialEligibility.policy.js';
import { OrganizationTrialEligibilityPolicy } from '../../domain/policies/organizationTrialEligibility.policy.js';
import { PrismaOrganizationTrialRepository } from '../repositories/prismaOrganizationTrial.repository.js';

export interface OrganizationTrialEligibilitySnapshot {
  eligibility: OrganizationTrialEligibility;
  existingTrial: OrganizationTrialProps | null;
  billingCustomerId: string;
}

export async function readOrganizationTrialEligibility(
  db: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
): Promise<OrganizationTrialEligibilitySnapshot> {
  const organization = await db.organization.findUnique({
    where: {
      id: organizationId,
    },
    select: {
      id: true,
      ownerId: true,
      creationKey: true,
      setupCompletedAt: true,
      trial: {
        select: {
          id: true,
        },
      },
      billingCustomer: {
        select: {
          id: true,
          stripeCustomerId: true,
          creationRequestedAt: true,
          _count: {
            select: {
              billingCustomerReferences: true,
            },
          },
        },
      },
      _count: {
        select: {
          organizationMembers: true,
          subscriptions: true,
          checkoutAttempts: true,
        },
      },
    },
  });

  const member = await db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
    select: {
      role: true,
      user: {
        select: {
          emailVerifiedAt: true,
          disabledAt: true,
        },
      },
    },
  });

  if (organization === null || member === null) {
    throw new BillingError('ORGANIZATION_NOT_FOUND');
  }

  if (organization.ownerId !== userId || member.role !== OrganizationRole.OWNER) {
    throw new BillingError('OWNER_REQUIRED');
  }

  if (member.user.disabledAt !== null || member.user.emailVerifiedAt === null) {
    throw new BillingError('EMAIL_NOT_VERIFIED');
  }

  const billingCustomer = organization.billingCustomer;

  if (billingCustomer === null) {
    throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
  }

  const repository = new PrismaOrganizationTrialRepository(db);

  const existingTrial = await repository.findByOwnerId(userId);

  const hasBillingActivity =
    organization._count.subscriptions > 0 ||
    organization._count.checkoutAttempts > 0 ||
    billingCustomer.stripeCustomerId !== null ||
    billingCustomer.creationRequestedAt !== null ||
    billingCustomer._count.billingCustomerReferences > 0;

  const paidOrganization = await db.organization.findFirst({
    where: {
      ownerId: userId,
      OR: [
        {
          subscriptions: {
            some: {
              paidThrough: {
                not: null,
              },
            },
          },
        },
        {
          billingInvoices: {
            some: {
              OR: [
                {
                  paidAt: {
                    not: null,
                  },
                },
                {
                  status: 'paid',
                },
              ],
            },
          },
        },
      ],
    },
    select: {
      id: true,
    },
  });

  const eligibility = OrganizationTrialEligibilityPolicy.resolve({
    organizationId,
    existingTrial,
    organizationHasTrial: organization.trial !== null,
    setupCompletedAt: organization.setupCompletedAt,
    isInitialOrganization: organization.creationKey === userId,
    memberCount: organization._count.organizationMembers,
    hasBillingActivity,
    hasPaidSubscriptionHistory: paidOrganization !== null,
  });

  return {
    eligibility,
    existingTrial,
    billingCustomerId: billingCustomer.id,
  };
}
