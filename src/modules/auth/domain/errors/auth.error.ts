export class AuthError extends Error {
  constructor(
    readonly code:
      | 'INVALID_CREDENTIALS'
      | 'EMAIL_NOT_VERIFIED'
      | 'INVALID_SESSION'
      | 'TOKEN_REUSED'
      | 'INVALID_TOKEN'
      | 'INVALID_PASSWORD'
      | 'PLAN_UNAVAILABLE',
  ) {
    super(code);
    this.name = 'AuthError';
  }
}
