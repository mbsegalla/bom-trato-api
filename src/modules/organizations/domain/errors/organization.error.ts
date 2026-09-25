export type OrganizationErrorCode =
  | 'INVALID_ORGANIZATION_NAME'
  | 'INVALID_ORGANIZATION_EMAIL'
  | 'INVALID_ORGANIZATION_PHONE'
  | 'INVALID_ORGANIZATION_DOCUMENT'
  | 'INVALID_ORGANIZATION_ADDRESS'
  | 'INVALID_ORGANIZATION_CITY'
  | 'INVALID_ORGANIZATION_STATE'
  | 'INVALID_ORGANIZATION_POSTAL_CODE'
  | 'EMPTY_ORGANIZATION_UPDATE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'VERIFIED_USER_REQUIRED';

export class OrganizationError extends Error {
  constructor(readonly code: OrganizationErrorCode) {
    super(code);

    this.name = 'OrganizationError';
  }
}
