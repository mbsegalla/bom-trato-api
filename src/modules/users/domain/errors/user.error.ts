export class UserError extends Error {
  constructor(
    readonly code:
      'INVALID_PASSWORD' | 'INVALID_CREDENTIALS' | 'EMAIL_NOT_VERIFIED' | 'INVALID_TOKEN' | 'EMAIL_ALREADY_EXISTS',
  ) {
    super(code);
    this.name = 'UserError';
  }
}
