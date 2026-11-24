import type { OrganizationPlatformAccess } from '../../../organizations/domain/policies/organizationPlatformAccess.policy.js';

export const TRIAL_AUTOMATION_LIMIT = 50;

export class TrialAutomationPolicy {
  static canEnqueue(access: OrganizationPlatformAccess, used: number): boolean {
    if (!access.hasAccess || access.billingNeedsReconciliation) {
      return false;
    }

    if (access.source === 'SUBSCRIPTION') {
      return true;
    }

    return access.source === 'TRIAL' && Number.isSafeInteger(used) && used >= 0 && used < TRIAL_AUTOMATION_LIMIT;
  }

  static remaining(used: number): number {
    if (!Number.isSafeInteger(used) || used < 0) {
      return 0;
    }

    return Math.max(0, TRIAL_AUTOMATION_LIMIT - used);
  }
}
