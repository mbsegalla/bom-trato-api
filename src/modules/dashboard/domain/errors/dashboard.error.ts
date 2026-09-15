export type DashboardErrorCode =
  | 'ORGANIZATION_NOT_FOUND'
  | 'MEMBER_REQUIRED'
  | 'VERIFIED_USER_REQUIRED'
  | 'SUBSCRIPTION_REQUIRED'
  | 'BILLING_RECONCILIATION_REQUIRED'
  | 'INVALID_DASHBOARD_PERIOD'
  | 'INVALID_DASHBOARD_LIMIT'
  | 'DASHBOARD_VALUE_OUT_OF_RANGE'
  | 'DASHBOARD_BUSY';

export class DashboardError extends Error {
  constructor(readonly code: DashboardErrorCode) {
    super(code);
    this.name = DashboardError.name;
  }
}
