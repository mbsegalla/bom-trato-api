import { describe, expect, it } from 'vitest';

import { assertSandboxPixInput, isValidSandboxDynamicPix, sandboxPixBalance, sandboxPixStatus, SANDBOX_PIX_PROCESSING_MS } from './mercadoPagoSandboxPix.policy.js';
import { pixCrc16 } from './receivablePixCharge.policy.js';

const now = new Date('2026-11-25T15:00:00Z');
const receivable = { version: 2, status: 'PARTIALLY_PAID', currency: 'brl', amountInCents: 50000, receivedInCents: 15000 };
const issuance = {
  status: 'PENDING' as const, receivableVersion: 2, amountInCents: 35000, createdAt: now,
  expiresAt: new Date(now.getTime() + 3600000),
};
const input = {
  version: 2, testBuyerEmail: 'test@example.com', testDocumentType: 'CPF' as const,
  testDocumentNumber: '19119119100', confirmed: true,
};

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, '0') + value;
}

function code(amount: string | null = '350.00', template = tlv('00', 'br.gov.bcb.pix') + tlv('25', 'example.invalid/test')): string {
  const payload = [
    tlv('00', '01'), tlv('01', '12'), tlv('26', template), tlv('52', '0000'), tlv('53', '986'),
    ...(amount === null ? [] : [tlv('54', amount)]),
    tlv('58', 'BR'), tlv('59', 'TEST'), tlv('60', 'SAO PAULO'), tlv('62', tlv('05', '***')), '6304',
  ].join('');
  return payload + pixCrc16(payload);
}

describe('sandbox Pix issuance policy', () => {
  it('uses only the current outstanding BRL balance', () => {
    expect(sandboxPixBalance(receivable)).toBe(35000);
    expect(sandboxPixBalance({ ...receivable, status: 'CANCELED' })).toBe(0);
    expect(sandboxPixBalance({ ...receivable, currency: 'usd' })).toBe(0);
    expect(sandboxPixBalance({ ...receivable, receivedInCents: -1 })).toBe(0);
    expect(sandboxPixBalance({ ...receivable, status: 'OPEN' })).toBe(0);
  });

  it('requires explicit confirmation and formatted test buyer fields', () => {
    expect(() => assertSandboxPixInput(input)).not.toThrow();
    expect(() => assertSandboxPixInput({ ...input, confirmed: false })).toThrow();
    expect(() => assertSandboxPixInput({ ...input, testDocumentNumber: '123' })).toThrow();
    expect(() => assertSandboxPixInput({ ...input, testBuyerEmail: 'wrong' })).toThrow();
  });

  it('never offers a pending code for stale receivables or disconnected sellers', () => {
    expect(sandboxPixStatus(issuance, receivable, true, now)).toBe('PENDING');
    expect(sandboxPixStatus(issuance, { ...receivable, version: 3 }, true, now)).toBe('STALE');
    expect(sandboxPixStatus(issuance, receivable, false, now)).toBe('STALE');
    expect(sandboxPixStatus(issuance, receivable, true, issuance.expiresAt)).toBe('EXPIRED');
  });

  it('preserves uncertainty and never treats a reserved attempt as unpaid or reusable', () => {
    const reserved = { ...issuance, status: 'RESERVED' as const, expiresAt: null };
    expect(sandboxPixStatus(null, receivable, true, now)).toBe('NOT_ISSUED');
    expect(sandboxPixStatus(reserved, receivable, true, now)).toBe('PROCESSING');
    expect(sandboxPixStatus(reserved, receivable, true, new Date(now.getTime() + SANDBOX_PIX_PROCESSING_MS))).toBe('REVIEW_REQUIRED');
    expect(sandboxPixStatus({ ...issuance, status: 'REVIEW_REQUIRED' }, receivable, true, now)).toBe('REVIEW_REQUIRED');
  });

  it('accepts valid dynamic BR Codes with CRC and matching amount, or provider-resolved amount', () => {
    expect(isValidSandboxDynamicPix(code(), 35000)).toBe(true);
    expect(isValidSandboxDynamicPix(code(null), 35000)).toBe(true);
    expect(isValidSandboxDynamicPix(code('350.01'), 35000)).toBe(false);
    expect(isValidSandboxDynamicPix(code().slice(0, -1) + 'Z', 35000)).toBe(false);
    expect(isValidSandboxDynamicPix(code('350.00', tlv('00', 'br.gov.bcb.pix') + tlv('01', 'key')), 35000)).toBe(false);
    expect(isValidSandboxDynamicPix(code('350.00', tlv('00', 'wrong') + tlv('25', 'example.invalid')), 35000)).toBe(false);
  });
});
