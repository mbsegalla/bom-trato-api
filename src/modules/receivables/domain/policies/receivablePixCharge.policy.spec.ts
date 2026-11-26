import { describe, expect, it } from 'vitest';

import { createReceivablePixCharge, pixCrc16, receivablePixTxid } from './receivablePixCharge.policy.js';

const input = {
  receivableId: '123e4567-e89b-42d3-a456-426655440000',
  currency: 'brl',
  status: 'PARTIALLY_PAID',
  amountInCents: 50000,
  receivedInCents: 15000,
  pixKeyType: 'EVP' as const,
  pixKey: '123e4567-e12b-12d1-a456-426655440000',
  merchantName: 'JOAO SERVICOS',
  merchantCity: 'SAO PAULO',
};

describe('static receivable Pix charge', () => {
  it('matches the published Banco Central CRC example', () => {
    const payload =
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';

    expect(pixCrc16(payload)).toBe('1D3D');
    expect(pixCrc16('123456789')).toBe('29B1');
  });

  it('encodes the remaining amount and a stable reference with a valid checksum', () => {
    const charge = createReceivablePixCharge(input);

    expect(charge.amountInCents).toBe(35000);
    expect(charge.copyAndPaste).toContain('5406350.00');
    expect(charge.copyAndPaste).toContain(`62290525${charge.txid}6304`);
    expect(charge.copyAndPaste.slice(-4)).toBe(pixCrc16(charge.copyAndPaste.slice(0, -4)));
    expect(charge.txid).toMatch(/^[A-Z0-9]{25}$/);
    expect(createReceivablePixCharge({ ...input, receivedInCents: 49999 }).copyAndPaste).toContain('54040.01');
    expect(createReceivablePixCharge({ ...input, receivedInCents: 49999 }).txid).toBe(charge.txid);
  });

  it('preserves the entire UUID in the transaction reference', () => {
    const reference = receivablePixTxid('ffffffff-ffff-ffff-ffff-ffffffffffff');

    expect(reference).toHaveLength(25);
    expect(receivablePixTxid('00000000-0000-0000-0000-000000000001')).toBe('0000000000000000000000001');
    expect(reference).not.toBe(receivablePixTxid('ffffffff-ffff-ffff-ffff-fffffffffffe'));
  });

  it('handles the longest supported email without overflowing the account template', () => {
    const key = 'a'.repeat(65) + '@example.com';
    const charge = createReceivablePixCharge({ ...input, pixKeyType: 'EMAIL', pixKey: key });

    expect(charge.copyAndPaste).toContain('26990014br.gov.bcb.pix0177' + key);
  });

  it.each([
    { status: 'PAID' },
    { status: 'CANCELED' },
    { receivedInCents: 50000 },
    { receivedInCents: -1 },
    { receivedInCents: 0 },
    { amountInCents: 50000.5 },
    { currency: 'usd' },
    { merchantName: 'JOÃO' },
    { merchantCity: 'A'.repeat(16) },
    { receivableId: 'not-a-uuid' },
    { pixKey: 'invalid' },
  ])('rejects invalid or ineligible inputs: %j', (patch) => {
    expect(() => createReceivablePixCharge({ ...input, ...patch })).toThrow();
  });
});
