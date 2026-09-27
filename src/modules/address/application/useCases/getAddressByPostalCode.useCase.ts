import { AddressError } from '../../domain/errors/address.error.js';
import type { AddressLookup } from '../../domain/types/address.types.js';
import { PostalCode } from '../../domain/valueObjects/postalCode.valueObject.js';
import type { AddressProvider } from '../ports/addressProvider.port.js';

export class GetAddressByPostalCodeUseCase {
  constructor(private readonly provider: AddressProvider) {}

  async execute(input: string): Promise<AddressLookup> {
    const postalCode = PostalCode.create(input);

    const address = await this.provider.findByPostalCode(postalCode.value);

    if (!address) {
      throw new AddressError('POSTAL_CODE_NOT_FOUND');
    }

    return address;
  }
}
