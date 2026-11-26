import { describe, expect, it, vi } from 'vitest';

import { MercadoPagoClient } from './mercadoPagoClient.js';
import type { ReadMercadoPagoSandboxPixInput } from './mercadoPagoPix.types.js';

const config = {
  clientId: '123456789',
  clientSecret: 'fixture-secret',
  redirectUri: 'https://example.com/mercado-pago/callback',
  liveMode: false,
};
const input: ReadMercadoPagoSandboxPixInput = {
  issuanceId: '4586a4c1-924c-4a48-9949-a837e7540c2c',
  accountId: '123456',
  paymentId: '456789',
  accessToken: 'fixture-access',
  amountInCents: 35001,
};
const response = {
  id: 456789,
  collector_id: 123456,
  live_mode: false,
  external_reference: input.issuanceId,
  payment_method_id: 'pix',
  payment_type_id: 'bank_transfer',
  currency_id: 'BRL',
  transaction_amount: '350.01',
  transaction_amount_refunded: 0,
  status: 'pending',
  status_detail: 'pending_waiting_transfer',
};

function fixture(payload: unknown, liveMode = false) {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));

  return { transport, client: new MercadoPagoClient({ ...config, liveMode }, transport) };
}

describe('authoritative sandbox Pix payment lookup', () => {
  it('uses only the bound payment and seller access token', async () => {
    const { client, transport } = fixture(response);

    await expect(client.readSandboxPix(input)).resolves.toBe('PENDING');
    expect(transport).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/payments/456789',
      expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer fixture-access' } }),
    );
  });

  it('recognizes a verified test approval but not an unaccredited approval', async () => {
    const approved = {
      ...response,
      status: 'approved',
      status_detail: 'accredited',
      date_approved: new Date().toISOString()
    };

    await expect(fixture(approved).client.readSandboxPix(input)).resolves.toBe('APPROVED');
    await expect(fixture({
      ...approved,
      status_detail: 'other'
    }).client.readSandboxPix(input)).resolves.toBe('REVIEW_REQUIRED');
    await expect(fixture({ ...approved, date_approved: 'bad' }).client.readSandboxPix(input)).rejects.toThrow('INVALID_RESPONSE');
    await expect(fixture({
      ...approved,
      transaction_amount_refunded: '1.00'
    }).client.readSandboxPix(input)).resolves.toBe('REFUNDED');
  });

  it.each(['rejected', 'cancelled'])('recognizes closed test payments: %s', async (status) => {
    await expect(fixture({ ...response, status }).client.readSandboxPix(input)).resolves.toBe('CLOSED');
  });

  it.each([
    { id: 456788 },
    { collector_id: 123457 },
    { live_mode: true },
    { external_reference: 'another-reservation' },
    { currency_id: 'USD' },
    { payment_method_id: 'visa' },
    { payment_type_id: 'credit_card' },
    { transaction_amount: '350.02' },
    { transaction_amount_refunded: 351 },
  ])('rejects an unbound or inconsistent payment: %j', async (patch) => {
    await expect(fixture({ ...response, ...patch }).client.readSandboxPix(input)).rejects.toThrow();
  });

  it('never reads with a live client', async () => {
    const { client, transport } = fixture(response, true);

    await expect(client.readSandboxPix(input)).rejects.toThrow('MODE_MISMATCH');
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('authoritative live Pix observation (mock provider only)', () => {
  const liveInput = { ...input, eventId: 'delivery-key' };
  const approvedAt = new Date('2025-01-01T12:00:00-03:00');
  const approved = {
    ...response,
    live_mode: true,
    status: 'approved',
    status_detail: 'accredited',
    date_approved: approvedAt.toISOString(),
  };

  it('returns verified ledger evidence only for a bound, approved live Pix', async () => {
    const { client, transport } = fixture(approved, true);

    await expect(client.readLivePix(liveInput)).resolves.toEqual({
      status: 'APPROVED',
      payment: {
        provider: 'mercado-pago',
        externalAccountId: input.accountId,
        externalPaymentId: input.paymentId,
        liveMode: true,
        eventId: liveInput.eventId,
        amountInCents: input.amountInCents,
        currency: 'brl',
        paidAt: approvedAt,
      },
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    { live_mode: false },
    { external_reference: 'different-issuance' },
    { collector_id: 123457 },
    { transaction_amount: '350.02' },
    { currency_id: 'USD' },
    { date_approved: 'invalid' },
    { date_approved: '2099-01-01T00:00:00Z' },
  ])('rejects inconsistent live confirmation data: %j', async (patch) => {
    await expect(fixture({ ...approved, ...patch }, true).client.readLivePix(liveInput)).rejects.toThrow();
  });

  it('keeps pending, refund, closure and uncertain statuses separate from approved evidence', async () => {
    await expect(fixture({ ...response, live_mode: true }, true).client.readLivePix(liveInput))
      .resolves.toEqual({ status: 'PENDING' });
    await expect(fixture({ ...approved, transaction_amount_refunded: 1 }, true).client.readLivePix(liveInput))
      .resolves.toEqual({ status: 'REFUNDED' });
    await expect(fixture({ ...approved, status: 'charged_back' }, true).client.readLivePix(liveInput))
      .resolves.toEqual({ status: 'REFUNDED' });
    await expect(fixture({ ...approved, status: 'cancelled' }, true).client.readLivePix(liveInput))
      .resolves.toEqual({ status: 'CLOSED' });
    await expect(fixture({ ...approved, status_detail: 'unknown' }, true).client.readLivePix(liveInput))
      .resolves.toEqual({ status: 'REVIEW_REQUIRED' });
  });

  it('never reads a live payment through a test client', async () => {
    const { client, transport } = fixture(approved);

    await expect(client.readLivePix(liveInput)).rejects.toThrow('MODE_MISMATCH');
    expect(transport).not.toHaveBeenCalled();
  });
});
