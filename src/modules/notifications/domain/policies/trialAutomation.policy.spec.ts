import { describe, expect, it } from 'vitest';

import { TrialAutomationPolicy } from './trialAutomation.policy.js';
import type { OrganizationPlatformAccess } from '../../../organizations/domain/policies/organizationPlatformAccess.policy.js';

const trial: OrganizationPlatformAccess = { hasAccess: true, source: 'TRIAL', billingNeedsReconciliation: false };

describe('TrialAutomationPolicy', () => {
  it('enforces the exact trial quota and rejects invalid usage counts', () => {
    expect(TrialAutomationPolicy.canEnqueue(trial, 49)).toBe(true);

    for (const used of [50, 51, -1, 0.5, NaN, Infinity]) expect(TrialAutomationPolicy.canEnqueue(trial, used)).toBe(false);

    expect(TrialAutomationPolicy.remaining(49)).toBe(1);

    for (const used of [50, 60, -1, NaN]) expect(TrialAutomationPolicy.remaining(used)).toBe(0);
  });

  it('allows paid access beyond trial quota but fails closed on unresolved billing or inactive access', () => {
    const paid = { ...trial, source: 'SUBSCRIPTION' as const };

    expect(TrialAutomationPolicy.canEnqueue(paid, 500)).toBe(true);
    expect(TrialAutomationPolicy.canEnqueue({ ...paid, billingNeedsReconciliation: true }, 0)).toBe(false);
    expect(TrialAutomationPolicy.canEnqueue({ ...paid, hasAccess: false }, 0)).toBe(false);
  });
});
