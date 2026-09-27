import type { AddressLookup, BrazilianCity } from '../../domain/types/address.types.js';

export abstract class AddressProvider {
  abstract findByPostalCode(postalCode: string): Promise<AddressLookup | null>;
  abstract listCities(state: string): Promise<BrazilianCity[]>;
}
