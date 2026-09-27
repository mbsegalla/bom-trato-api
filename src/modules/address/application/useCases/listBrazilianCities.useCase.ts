import type { BrazilianCity } from '../../domain/types/address.types.js';
import { StateCode } from '../../domain/valueObjects/stateCode.valueObject.js';
import type { AddressProvider } from '../ports/addressProvider.port.js';

export class ListBrazilianCitiesUseCase {
  constructor(private readonly provider: AddressProvider) {}

  execute(input: string): Promise<BrazilianCity[]> {
    const state = StateCode.create(input);

    return this.provider.listCities(state.value);
  }
}
