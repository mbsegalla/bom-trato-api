import { CheckoutAttemptStatus, SubscriptionStatus } from '../../../../generated/prisma/enums.js';
import type { SubscriptionProps } from '../../../billing/domain/entities/subscription.entity.js';
import { Subscription } from '../../../billing/domain/entities/subscription.entity.js';
import { OrganizationTrial } from '../../../organizations/domain/entities/organizationTrial.entity.js';
import type { OrganizationPlatformAccess } from '../../../organizations/domain/policies/organizationPlatformAccess.policy.js';
import { OrganizationPlatformAccessPolicy } from '../../../organizations/domain/policies/organizationPlatformAccess.policy.js';
import type { OnboardingSnapshot, OnboardingState, OnboardingTrialState } from '../types/onboarding.types.js';
import { OnboardingStep } from '../types/onboarding.types.js';

export class OnboardingFlowPolicy {
  static resolve(snapshot: OnboardingSnapshot, now: Date): OnboardingState {
    if (snapshot.organizationId === null) {
      return this.provisioningState(snapshot);
    }

    const access = OrganizationPlatformAccessPolicy.resolve(
      {
        organizationId: snapshot.organizationId,
        subscriptions: snapshot.subscriptions,
        trial: snapshot.trial,
        hasPaidSubscriptionHistory: snapshot.hasPaidSubscriptionHistory,
      },
      now,
    );

    const currentSubscription = snapshot.subscriptions.find((subscription) =>
      Subscription.blocksNewCheckout(subscription.status),
    );

    const trialEligible = this.canStartTrial(snapshot, access, currentSubscription);

    return {
      step: this.resolveStep(snapshot, access, currentSubscription, trialEligible),
      organizationId: snapshot.organizationId,
      selectedPlanPriceId: snapshot.planPriceId,
      accessSource: access.source,
      trialEligible,
      trial: this.resolveTrial(snapshot, access.source === 'TRIAL', now),
    };
  }

  private static provisioningState(snapshot: OnboardingSnapshot): OnboardingState {
    return {
      step: OnboardingStep.Provisioning,
      organizationId: null,
      selectedPlanPriceId: snapshot.planPriceId,
      accessSource: 'NONE',
      trialEligible: false,
      trial: null,
    };
  }

  private static canStartTrial(
    snapshot: OnboardingSnapshot,
    access: OrganizationPlatformAccess,
    currentSubscription: SubscriptionProps | undefined,
  ): boolean {
    return (
      snapshot.isOwner &&
      snapshot.trialEligible &&
      snapshot.setupCompletedAt === null &&
      snapshot.trial === null &&
      !snapshot.hasPaidSubscriptionHistory &&
      !access.hasAccess &&
      !access.billingNeedsReconciliation &&
      currentSubscription === undefined &&
      snapshot.checkoutStatus === null
    );
  }

  private static resolveStep(
    snapshot: OnboardingSnapshot,
    access: OrganizationPlatformAccess,
    currentSubscription: SubscriptionProps | undefined,
    trialEligible: boolean,
  ): OnboardingStep {
    if (access.billingNeedsReconciliation) {
      return snapshot.isOwner ? OnboardingStep.BillingReview : OnboardingStep.ContactOwner;
    }

    if (access.hasAccess && snapshot.setupCompletedAt !== null) {
      return OnboardingStep.App;
    }

    if (!snapshot.isOwner) {
      return OnboardingStep.ContactOwner;
    }

    if (access.hasAccess || trialEligible) {
      return OnboardingStep.CreateBusiness;
    }

    return this.resolveBillingStep(snapshot, currentSubscription);
  }

  private static resolveBillingStep(
    snapshot: OnboardingSnapshot,
    currentSubscription: SubscriptionProps | undefined,
  ): OnboardingStep {
    if (currentSubscription !== undefined) {
      return this.isAwaitingPayment(currentSubscription)
        ? OnboardingStep.PaymentPending
        : OnboardingStep.BillingRequired;
    }

    if (snapshot.checkoutStatus === CheckoutAttemptStatus.COMPLETE && snapshot.subscriptions.length === 0) {
      return OnboardingStep.PaymentPending;
    }

    return snapshot.priceAvailable ? OnboardingStep.Payment : OnboardingStep.SelectPlan;
  }

  private static isAwaitingPayment(subscription: SubscriptionProps): boolean {
    return subscription.status === SubscriptionStatus.ACTIVE && subscription.paidThrough === null;
  }

  private static resolveTrial(snapshot: OnboardingSnapshot, active: boolean, now: Date): OnboardingTrialState | null {
    if (snapshot.trial === null) {
      return null;
    }

    const trial = OrganizationTrial.restore(snapshot.trial);

    return {
      startsAt: snapshot.trial.startsAt,
      expiresAt: snapshot.trial.expiresAt,
      convertedAt: snapshot.trial.convertedAt,
      revokedAt: snapshot.trial.revokedAt,
      remainingDays: active ? trial.remainingDaysAt(now) : 0,
      active,
    };
  }
}
