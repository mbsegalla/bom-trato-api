import { describe, expect, it } from 'vitest';

import { assertLivePixInput } from './mercadoPagoLivePix.policy.js';

const input = {
  version: 1,
  buyerEmail: 'fixture@example.invalid',
  buyerDocumentType: 'CPF' as const,
  buyerDocumentNumber: '19119119100',
  confirmed: true,
};

describe('live Pix issuance admission', () => {
  it('requires explicit consent and valid caller-provided payer fields', () => {
    expect(() => assertLivePixInput(input)).not.toThrow();
    expect(() => assertLivePixInput({ ...input, confirmed: false })).toThrow('MERCADO_PAGO_PIX_INVALID');
    expect(() => assertLivePixInput({ ...input, buyerEmail: 'invalid' })).toThrow('MERCADO_PAGO_PIX_INVALID');
    expect(() => assertLivePixInput({ ...input, buyerDocumentNumber: '123' })).toThrow('MERCADO_PAGO_PIX_INVALID');
    expect(() => assertLivePixInput({ ...input, buyerDocumentType: 'CNPJ' })).toThrow('MERCADO_PAGO_PIX_INVALID');
    expect(() => assertLivePixInput({ ...input, version: 0 })).toThrow('MERCADO_PAGO_PIX_INVALID');
  });
});
