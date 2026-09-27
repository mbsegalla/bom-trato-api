import { AddressError } from '../errors/address.error.js';

export class PostalCode {
  private constructor(readonly value: string) {}

  static create(input: string): PostalCode {
    const normalized = input.replace(/\D/g, '');

    if (!/^\d{8}$/.test(normalized)) {
      throw new AddressError('INVALID_POSTAL_CODE');
    }

    return new PostalCode(normalized);
  }
}
