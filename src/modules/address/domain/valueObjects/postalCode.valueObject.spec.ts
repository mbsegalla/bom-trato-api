import { describe, expect, it } from 'vitest';

import { PostalCode } from './postalCode.valueObject.js';
import { StateCode } from './stateCode.valueObject.js';

describe('Brazilian address value objects', () => {
  it('normalizes formatted postal codes and lowercase state codes', () => {
    expect(PostalCode.create('01001-000').value).toBe('01001000');
    expect(StateCode.create(' mg ').value).toBe('MG');
  });

  it.each(['1234567', '123456789', ''])('rejects incorrect postal code length: %s', (value) => {
    expect(() => PostalCode.create(value)).toThrow('INVALID_POSTAL_CODE');
  });

  it.each(['XX', 'BR', ''])('rejects unknown state: %s', (value) => {
    expect(() => StateCode.create(value)).toThrow('INVALID_STATE');
  });
});
