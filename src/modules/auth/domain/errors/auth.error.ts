export class AuthError extends Error {
  constructor(
    readonly code:
      | 'INVALID_CREDENTIALS'
      | 'EMAIL_NOT_VERIFIED'
      | 'INVALID_SESSION'
      | 'TOKEN_REUSED'
      | 'INVALID_TOKEN'
      | 'INVALID_PASSWORD'
      | 'PLAN_UNAVAILABLE'
      | 'INVALID_GOOGLE_CREDENTIAL'
      | 'GOOGLE_EMAIL_NOT_VERIFIED'
      | 'GOOGLE_ACCOUNT_LINK_REQUIRED'
      | 'GOOGLE_EMAIL_MISMATCH'
      | 'GOOGLE_IDENTITY_IN_USE'
      | 'GOOGLE_PROVIDER_ALREADY_LINKED'
      | 'GOOGLE_IDENTITY_CONFLICT',
  ) {
    super(code);

    this.name = 'AuthError';
  }
}
