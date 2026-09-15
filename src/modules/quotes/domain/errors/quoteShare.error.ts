export type QuoteShareErrorCode =
  'QUOTE_SHARE_NOT_FOUND' | 'INVALID_QUOTE_SHARE_EXPIRATION' | 'QUOTE_SHARE_ALREADY_DECIDED';

export class QuoteShareError extends Error {
  constructor(readonly code: QuoteShareErrorCode) {
    super(code);
    this.name = 'QuoteShareError';
  }
}
