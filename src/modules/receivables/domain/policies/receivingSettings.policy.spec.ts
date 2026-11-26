import { describe, expect, it } from 'vitest';

import type { SaveReceivingSettingsInput } from '../types/receivingSettings.types.js';

import { normalizePixKey, ReceivingSettingsPolicy } from './receivingSettings.policy.js';

const input: SaveReceivingSettingsInput = {
  pixEnabled: true,
  pixKeyType: 'EMAIL',
  pixKey: ' PIX@Example.com ',
  merchantName: 'João Serviços',
  merchantCity: 'São Paulo',
  confirmed: true,
  version: 0,
};

describe('receiving settings policy', () => {
  it.each([
    ['CPF', '123.456.789-01', '12345678901'],
    ['CNPJ', '12.ab3.456/0001-99', '12AB3456000199'],
    ['PHONE', '+55 (34) 99999-9999', '+5534999999999'],
    ['EMAIL', ' PIX@Example.com ', 'pix@example.com'],
    ['EVP', '123E4567-E89B-12D3-A456-426655440000', '123e4567-e89b-12d3-a456-426655440000'],
  ] as const)('normalizes %s', (type, raw, normalized) => {
    expect(normalizePixKey(type, raw)).toBe(normalized);
  });

  it.each([
    ['CPF', '1234567890'],
    ['CPF', 'a12345678901'],
    ['CNPJ', '12AB34560001AB'],
    ['PHONE', '34999999999'],
    ['PHONE', '+012345'],
    ['EMAIL', 'not an email'],
    ['EMAIL', 'a'.repeat(70) + '@example.com'],
    ['EVP', 'not-a-key'],
  ] as const)('rejects malformed %s', (type, raw) => {
    expect(() => normalizePixKey(type, raw)).toThrow('INVALID_RECEIVING_SETTINGS');
  });

  it('requires explicit confirmation and normalizes displayed merchant fields', () => {
    expect(ReceivingSettingsPolicy.configure(input, 0)).toEqual({
      pixEnabled: true,
      pixKeyType: 'EMAIL',
      pixKey: 'pix@example.com',
      merchantName: 'JOAO SERVICOS',
      merchantCity: 'SAO PAULO',
    });
    expect(() => ReceivingSettingsPolicy.configure({ ...input, confirmed: false }, 0)).toThrow(
      'INVALID_RECEIVING_SETTINGS',
    );
  });

  it('rejects stale versions and invalid merchant labels', () => {
    expect(() => ReceivingSettingsPolicy.configure(input, 1)).toThrow('RECEIVING_SETTINGS_VERSION_CONFLICT');
    expect(() => ReceivingSettingsPolicy.configure({ ...input, merchantName: 'x'.repeat(26) }, 0)).toThrow(
      'INVALID_RECEIVING_SETTINGS',
    );
    expect(() => ReceivingSettingsPolicy.configure({ ...input, merchantCity: 'São\nPaulo' }, 0)).toThrow(
      'INVALID_RECEIVING_SETTINGS',
    );
  });

  it('clears the destination when disabling Pix', () => {
    const disabled = { pixEnabled: false, pixKeyType: null, pixKey: null, merchantName: null, merchantCity: null };
    expect(ReceivingSettingsPolicy.configure({ ...disabled, confirmed: false, version: 1 }, 1)).toEqual(disabled);
    expect(() => ReceivingSettingsPolicy.configure({ ...input, pixEnabled: false }, 0)).toThrow(
      'INVALID_RECEIVING_SETTINGS',
    );
  });
});
