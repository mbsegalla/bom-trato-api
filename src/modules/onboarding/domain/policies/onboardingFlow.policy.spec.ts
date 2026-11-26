import { describe, expect, it } from 'vitest';

import { OrganizationTrial } from '../../../organizations/domain/entities/organizationTrial.entity.js';
import type { OnboardingSnapshot } from '../types/onboarding.types.js';
import { OnboardingFlowPolicy } from './onboardingFlow.policy.js';

const now = new Date('2026-01-01T00:00:00Z');
const snapshot: OnboardingSnapshot = {
  organizationId: 'org', isOwner: true, setupCompletedAt: null, planPriceId: null, priceAvailable: false,
  subscriptions: [], checkoutStatus: null, trial: null, trialEligible: false, hasPaidSubscriptionHistory: false,
};

describe('OnboardingFlowPolicy', () => {
  it('routes provisioning and initial plan selection', () => {
    expect(OnboardingFlowPolicy.resolve({ ...snapshot, organizationId: null }, now).step).toBe('PROVISIONING');
    expect(OnboardingFlowPolicy.resolve(snapshot, now).step).toBe('SELECT_PLAN');
    expect(OnboardingFlowPolicy.resolve({ ...snapshot, priceAvailable: true }, now).step).toBe('PAYMENT');
  });

  it('does not treat completed checkout as verified payment', () => {
    expect(OnboardingFlowPolicy.resolve({ ...snapshot, checkoutStatus: 'COMPLETE' }, now).step).toBe('PAYMENT_PENDING');
  });

  it('routes eligible owners into setup, verified trial users into app, and other members to owner', () => {
    expect(OnboardingFlowPolicy.resolve({ ...snapshot, trialEligible: true }, now)).toMatchObject({ step: 'CREATE_BUSINESS', trialEligible: true });
    expect(OnboardingFlowPolicy.resolve({ ...snapshot, isOwner: false, trialEligible: true }, now).step).toBe('CONTACT_OWNER');
    const trial = OrganizationTrial.create({ id: 'trial', organizationId: 'org', ownerId: 'owner', now }).snapshot();
    expect(OnboardingFlowPolicy.resolve({ ...snapshot, trial, setupCompletedAt: now }, now)).toMatchObject({
      step: 'APP', accessSource: 'TRIAL', trial: { active: true, remainingDays: 14 },
    });
  });
});
