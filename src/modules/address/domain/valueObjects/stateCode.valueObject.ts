import { isBrazilianStateCode } from '../../../../shared/states/brazilianStates.js';
import { AddressError } from '../errors/address.error.js';

export class StateCode {
  private constructor(readonly value: string) {}

  static create(input: string): StateCode {
    const normalized = input.trim().toUpperCase();

    if (!isBrazilianStateCode(normalized)) {
      throw new AddressError('INVALID_STATE');
    }

    return new StateCode(normalized);
  }
}
