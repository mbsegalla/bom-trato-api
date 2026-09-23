import type { SubscriptionProps } from '../../billing/domain/entities/subscription.entity.js';
import { Subscription } from '../../billing/domain/entities/subscription.entity.js';

export const onboardingSteps = [
  'SELECT_PLAN',
  'PAYMENT',
  'PAYMENT_PENDING',
  'BILLING_REQUIRED',
  'BILLING_REVIEW',
  'CREATE_BUSINESS',
  'APP',
  'CONTACT_OWNER',
] as const;

export type OnboardingStep = (typeof onboardingSteps)[number];

export interface OnboardingSnapshot {
  organizationId: string | null;
  isOwner: boolean;
  planPriceId: string | null;
  priceAvailable: boolean;
  subscriptions: SubscriptionProps[];
  checkoutStatus: 'PENDING' | 'COMPLETE' | 'EXPIRED' | null;
}

export interface OnboardingState {
  step: OnboardingStep;
  organizationId: string | null;
  selectedPlanPriceId: string | null;
}

export class Onboarding {
  static resolve(snapshot: OnboardingSnapshot, now: Date): OnboardingState {
    if (snapshot.organizationId === null) {
      return {
        step: 'CREATE_BUSINESS',
        organizationId: null,
        selectedPlanPriceId: snapshot.planPriceId,
      };
    }

    const ongoing = snapshot.subscriptions.filter((subscription) =>
      Subscription.blocksNewCheckout(subscription.status),
    );

    const current = ongoing[0];

    let step: OnboardingStep;

    if (ongoing.length > 1) {
      step = snapshot.isOwner ? 'BILLING_REVIEW' : 'CONTACT_OWNER';
    } else if (current && Subscription.restore(current).hasAccessAt(now)) {
      step = 'APP';
    } else if (!snapshot.isOwner) {
      step = 'CONTACT_OWNER';
    } else if (current) {
      // Recover the existing subscription instead of creating another one.
      step = current.status === 'ACTIVE' && current.paidThrough === null ? 'PAYMENT_PENDING' : 'BILLING_REQUIRED';
    } else if (snapshot.checkoutStatus === 'COMPLETE' && snapshot.subscriptions.length === 0) {
      step = 'PAYMENT_PENDING';
    } else {
      step = snapshot.priceAvailable ? 'PAYMENT' : 'SELECT_PLAN';
    }

    return {
      step,
      organizationId: snapshot.organizationId,
      selectedPlanPriceId: snapshot.planPriceId,
    };
  }
}
