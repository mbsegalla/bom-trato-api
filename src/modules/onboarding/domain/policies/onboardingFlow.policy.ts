import { CheckoutAttemptStatus, SubscriptionStatus } from '../../../../generated/prisma/enums.js';
import { Subscription } from '../../../billing/domain/entities/subscription.entity.js';
import { type OnboardingSnapshot, type OnboardingState, OnboardingStep } from '../types/onboarding.types.js';

export class OnboardingFlowPolicy {
  static resolve(snapshot: OnboardingSnapshot, now: Date): OnboardingState {
    if (snapshot.organizationId === null) {
      return {
        step: OnboardingStep.Provisioning,
        organizationId: null,
        selectedPlanPriceId: snapshot.planPriceId,
      };
    }

    const ongoingSubscriptions = snapshot.subscriptions.filter((subscription) =>
      Subscription.blocksNewCheckout(subscription.status),
    );

    const currentSubscription = ongoingSubscriptions[0];

    let step: OnboardingStep;

    if (ongoingSubscriptions.length > 1) {
      step = snapshot.isOwner ? OnboardingStep.BillingReview : OnboardingStep.ContactOwner;
    } else if (currentSubscription && Subscription.restore(currentSubscription).hasAccessAt(now)) {
      step = snapshot.setupCompletedAt === null ? OnboardingStep.CreateBusiness : OnboardingStep.App;
    } else if (!snapshot.isOwner) {
      step = OnboardingStep.ContactOwner;
    } else if (currentSubscription) {
      step =
        currentSubscription.status === SubscriptionStatus.ACTIVE && currentSubscription.paidThrough === null
          ? OnboardingStep.PaymentPending
          : OnboardingStep.BillingRequired;
    } else if (snapshot.checkoutStatus === CheckoutAttemptStatus.COMPLETE && snapshot.subscriptions.length === 0) {
      step = OnboardingStep.PaymentPending;
    } else {
      step = snapshot.priceAvailable ? OnboardingStep.Payment : OnboardingStep.SelectPlan;
    }

    return {
      step,
      organizationId: snapshot.organizationId,
      selectedPlanPriceId: snapshot.planPriceId,
    };
  }
}
