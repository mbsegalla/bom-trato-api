export type OrganizationErrorCode = 'INVALID_ORGANIZATION_NAME' | 'IDEMPOTENCY_CONFLICT' | 'VERIFIED_USER_REQUIRED';

export class OrganizationError extends Error {
  constructor(readonly code: OrganizationErrorCode) {
    super(code);

    this.name = 'OrganizationError';
  }
}
