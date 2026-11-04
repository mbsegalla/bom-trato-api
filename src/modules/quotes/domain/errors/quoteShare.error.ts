export type QuoteShareErrorCode =
  | 'QUOTE_SHARE_NOT_FOUND'
  | 'INVALID_QUOTE_SHARE_EXPIRATION'
  | 'QUOTE_SHARE_ALREADY_DECIDED'
  | 'QUOTE_SHARE_CHANGE_ALREADY_REQUESTED'
  | 'INVALID_QUOTE_CHANGE_REQUEST';

export class QuoteShareError extends Error {
  constructor(readonly code: QuoteShareErrorCode) {
    super(code);
    this.name = 'QuoteShareError';
  }
}
