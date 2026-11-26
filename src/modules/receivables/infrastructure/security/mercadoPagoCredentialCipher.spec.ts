import { describe, expect, it } from 'vitest';

import { MercadoPagoCredentialCipher } from './mercadoPagoCredentialCipher.js';

const cipher = new MercadoPagoCredentialCipher('a'.repeat(64));
const context = ['credential', 'organization-a', '123456', 'false', '654321', 'access'];

describe('Mercado Pago credential encryption', () => {
  it('uses random authenticated encryption without exposing the token', () => {
    const encrypted = cipher.seal(context, 'fixture-token');

    expect(encrypted).not.toContain('fixture-token');
    expect(cipher.seal(context, 'fixture-token')).not.toBe(encrypted);
    expect(cipher.open(context, encrypted)).toBe('fixture-token');
  });

  it('rejects another organization, mode, application or token purpose', () => {
    const encrypted = cipher.seal(context, 'fixture-token');

    for (const [index, replacement] of [[1, 'organization-b'], [2, '333'], [3, 'true'], [4, '999'], [5, 'refresh']] as const) {
      const different = [...context];

      different[index] = replacement;
      expect(() => cipher.open(different, encrypted)).toThrow('MERCADO_PAGO_UNAVAILABLE');
    }
  });

  it('fails closed on missing keys, tampered ciphertext and wrong keys', () => {
    const encrypted = cipher.seal(context, 'fixture-token');

    expect(() => new MercadoPagoCredentialCipher(undefined).seal(context, 'token')).toThrow('MERCADO_PAGO_UNAVAILABLE');
    expect(() => new MercadoPagoCredentialCipher('b'.repeat(64)).open(context, encrypted)).toThrow('MERCADO_PAGO_UNAVAILABLE');
    expect(() => cipher.open(context, 'v1.invalid')).toThrow('MERCADO_PAGO_UNAVAILABLE');
  });
});
