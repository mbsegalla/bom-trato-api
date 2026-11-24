import type { OrganizationTrialProps } from '../entities/organizationTrial.entity.js';

export type OrganizationTrialEligibility = 'AVAILABLE' | 'EXISTING' | 'TRIAL_ALREADY_USED' | 'TRIAL_NOT_AVAILABLE';

export interface OrganizationTrialEligibilityContext {
  organizationId: string;
  existingTrial: OrganizationTrialProps | null;
  organizationHasTrial: boolean;
  setupCompletedAt: Date | null;
  isInitialOrganization: boolean;
  memberCount: number;
  hasBillingActivity: boolean;
  hasPaidSubscriptionHistory: boolean;
}

export class OrganizationTrialEligibilityPolicy {
  static resolve(context: OrganizationTrialEligibilityContext): OrganizationTrialEligibility {
    const {
      organizationId,
      existingTrial,
      organizationHasTrial,
      setupCompletedAt,
      isInitialOrganization,
      memberCount,
      hasBillingActivity,
      hasPaidSubscriptionHistory,
    } = context;

    if (existingTrial !== null) {
      if (existingTrial.organizationId !== organizationId) {
        return 'TRIAL_ALREADY_USED';
      }

      if (setupCompletedAt === null) {
        return 'TRIAL_NOT_AVAILABLE';
      }

      return 'EXISTING';
    }

    if (
      organizationHasTrial ||
      setupCompletedAt !== null ||
      !isInitialOrganization ||
      memberCount !== 1 ||
      hasBillingActivity ||
      hasPaidSubscriptionHistory
    ) {
      return 'TRIAL_NOT_AVAILABLE';
    }

    return 'AVAILABLE';
  }
}
