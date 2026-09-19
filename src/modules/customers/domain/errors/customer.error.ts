export type CustomerErrorCode =
  | 'ORGANIZATION_NOT_FOUND'
  | 'MEMBER_REQUIRED'
  | 'VERIFIED_USER_REQUIRED'
  | 'SUBSCRIPTION_REQUIRED'
  | 'BILLING_RECONCILIATION_REQUIRED'
  | 'CUSTOMER_NOT_FOUND'
  | 'CUSTOMER_ARCHIVED'
  | 'INVALID_CUSTOMER_NAME'
  | 'INVALID_CUSTOMER_EMAIL'
  | 'INVALID_CUSTOMER_PHONE'
  | 'INVALID_CUSTOMER_NOTES'
  | 'EMPTY_CUSTOMER_UPDATE'
  | 'CUSTOMERS_BUSY'
  | 'CUSTOMER_OVERVIEW_VALUE_OUT_OF_RANGE';

export class CustomerError extends Error {
  constructor(readonly code: CustomerErrorCode) {
    super(code);
    this.name = 'CustomerError';
  }
}
