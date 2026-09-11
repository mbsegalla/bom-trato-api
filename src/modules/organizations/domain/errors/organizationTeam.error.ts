export type OrganizationTeamErrorCode =
  | 'ORGANIZATION_NOT_FOUND'
  | 'MEMBER_REQUIRED'
  | 'OWNER_REQUIRED'
  | 'VERIFIED_USER_REQUIRED'
  | 'MEMBER_NOT_FOUND'
  | 'OWNER_REMOVAL_FORBIDDEN'
  | 'ALREADY_MEMBER'
  | 'SUBSCRIPTION_REQUIRED'
  | 'TEAM_MANAGEMENT_REQUIRED'
  | 'MEMBER_LIMIT_REACHED'
  | 'BILLING_RECONCILIATION_REQUIRED'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_EXPIRED'
  | 'INVITATION_CLOSED'
  | 'INVITATION_ALREADY_PENDING'
  | 'INVITATION_EMAIL_MISMATCH'
  | 'INVITATION_RATE_LIMITED'
  | 'TEAM_BUSY';

export class OrganizationTeamError extends Error {
  constructor(readonly code: OrganizationTeamErrorCode) {
    super(code);

    this.name = 'OrganizationTeamError';
  }
}
