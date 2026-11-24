export type OrganizationTrialErrorCode =
  | 'INVALID_TRIAL_PERIOD'
  | 'INVALID_TRIAL_CONVERSION_DATE'
  | 'INVALID_TRIAL_REVOCATION_DATE'
  | 'TRIAL_ALREADY_USED'
  | 'TRIAL_NOT_AVAILABLE'
  | 'TRIAL_NOT_FOUND';

export class OrganizationTrialError extends Error {
  constructor(readonly code: OrganizationTrialErrorCode) {
    super(code);

    this.name = 'OrganizationTrialError';
  }
}
