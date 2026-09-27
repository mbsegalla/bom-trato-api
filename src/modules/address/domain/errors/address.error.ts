export type AddressErrorCode =
  | 'INVALID_POSTAL_CODE'
  | 'POSTAL_CODE_NOT_FOUND'
  | 'INVALID_STATE'
  | 'ADDRESS_PROVIDER_UNAVAILABLE'
  | 'ADDRESS_PROVIDER_INVALID_RESPONSE';

export class AddressError extends Error {
  constructor(readonly code: AddressErrorCode) {
    super(code);

    this.name = AddressError.name;
  }
}
