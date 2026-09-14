export type CatalogServiceErrorCode =
  | 'ORGANIZATION_NOT_FOUND'
  | 'MEMBER_REQUIRED'
  | 'VERIFIED_USER_REQUIRED'
  | 'SUBSCRIPTION_REQUIRED'
  | 'BILLING_RECONCILIATION_REQUIRED'
  | 'CATALOG_SERVICE_NOT_FOUND'
  | 'CATALOG_SERVICE_ARCHIVED'
  | 'INVALID_CATALOG_SERVICE_NAME'
  | 'INVALID_CATALOG_SERVICE_DESCRIPTION'
  | 'INVALID_CATALOG_SERVICE_UNIT'
  | 'INVALID_CATALOG_SERVICE_AMOUNT'
  | 'EMPTY_CATALOG_SERVICE_UPDATE'
  | 'CATALOG_BUSY';

export class CatalogServiceError extends Error {
  constructor(readonly code: CatalogServiceErrorCode) {
    super(code);
    this.name = 'CatalogServiceError';
  }
}
