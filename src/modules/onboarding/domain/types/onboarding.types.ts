import type { CheckoutAttemptStatus } from '../../../../generated/prisma/enums.js';
import type { SubscriptionProps } from '../../../billing/domain/entities/subscription.entity.js';

export const OnboardingStep = {
  Provisioning: 'PROVISIONING',
  SelectPlan: 'SELECT_PLAN',
  Payment: 'PAYMENT',
  PaymentPending: 'PAYMENT_PENDING',
  BillingRequired: 'BILLING_REQUIRED',
  BillingReview: 'BILLING_REVIEW',
  CreateBusiness: 'CREATE_BUSINESS',
  App: 'APP',
  ContactOwner: 'CONTACT_OWNER',
} as const;

export type OnboardingStep = (typeof OnboardingStep)[keyof typeof OnboardingStep];

export const onboardingSteps = Object.values(OnboardingStep);

export interface OnboardingSnapshot {
  organizationId: string | null;
  isOwner: boolean;
  setupCompletedAt: Date | null;
  planPriceId: string | null;
  priceAvailable: boolean;
  subscriptions: SubscriptionProps[];
  checkoutStatus: CheckoutAttemptStatus | null;
}

export interface OnboardingState {
  step: OnboardingStep;
  organizationId: string | null;
  selectedPlanPriceId: string | null;
}
