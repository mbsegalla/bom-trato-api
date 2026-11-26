import { describe, expect, it } from 'vitest';

import { OrganizationTrial } from '../entities/organizationTrial.entity.js';
import { OrganizationTrialEligibilityPolicy } from './organizationTrialEligibility.policy.js';
import type { OrganizationTrialEligibilityContext } from './organizationTrialEligibility.policy.js';

const now = new Date('2026-01-01T00:00:00Z');
const context: OrganizationTrialEligibilityContext = {
  organizationId: 'org',
  existingTrial: null,
  organizationHasTrial: false,
  setupCompletedAt: null,
  isInitialOrganization: true,
  memberCount: 1,
  hasBillingActivity: false,
  hasPaidSubscriptionHistory: false,
};
const trial = OrganizationTrial.create({
  id: 'trial',
  organizationId: 'org',
  ownerId: 'owner',
  now
}).snapshot();

describe('OrganizationTrialEligibilityPolicy', () => {
  it('grants eligibility only to a new initial organization', () => {
    expect(OrganizationTrialEligibilityPolicy.resolve(context)).toBe('AVAILABLE');
    for (const patch of [
      { memberCount: 2 },
      { isInitialOrganization: false },
      { hasBillingActivity: true },
      { hasPaidSubscriptionHistory: true },
      { organizationHasTrial: true },
      { setupCompletedAt: now }
    ]) {
    expect(OrganizationTrialEligibilityPolicy.resolve({ ...context, ...patch })).toBe('TRIAL_NOT_AVAILABLE');
  }
  });

  it('does not grant a second trial across organizations', () => {
    expect(OrganizationTrialEligibilityPolicy.resolve({
      ...context,
      existingTrial: trial,
      setupCompletedAt: now
    })).toBe('EXISTING');
    expect(OrganizationTrialEligibilityPolicy.resolve({
      ...context,
      existingTrial: { ...trial, organizationId: 'other' }
    })).toBe('TRIAL_ALREADY_USED');
  });
});
