import type { OrganizationTrialProps } from '../../domain/entities/organizationTrial.entity.js';

export interface ActivateOrganizationTrialParams {
  organizationId: string;
  userId: string;
  name: string;
}

export type OrganizationTrialActivationResult =
  | {
      status: 'ACTIVATED' | 'EXISTING';
      trial: OrganizationTrialProps;
    }
  | {
      status: 'TRIAL_ALREADY_USED' | 'TRIAL_NOT_AVAILABLE';
    };

export abstract class OrganizationTrialActivation {
  abstract activate(params: ActivateOrganizationTrialParams): Promise<OrganizationTrialActivationResult>;
}
