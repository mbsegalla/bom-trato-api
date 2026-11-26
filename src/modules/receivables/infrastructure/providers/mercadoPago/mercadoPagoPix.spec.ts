import { describe, expect, it, vi } from 'vitest';

import { MercadoPagoClient } from './mercadoPagoClient.js';
import type { CreateMercadoPagoPixInput } from './mercadoPagoPix.types.js';

const config = {
  clientId: '123456789',
  clientSecret: 'fixture-secret',
  redirectUri: 'https://example.com/mercado-pago/callback',
  liveMode: false,
};
const input: CreateMercadoPagoPixInput = {
  issuanceId: '4586a4c1-924c-4a48-9949-a837e7540c2c',
  accountId: '123456',
  accessToken: 'fixture-access',
  amountInCents: 35001,
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  payer: { email: 'test-payer@example.com', identification: { type: 'CPF', number: '19119119100' } },
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
  date_of_expiration: input.expiresAt.toISOString(),
  point_of_interaction: {
    transaction_data: { qr_code: '0002010102126304ABCD' },
  },
};

function fixture(payload: unknown, liveMode = false) {
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(payload, { status: 201 }));

  return { transport, client: new MercadoPagoClient({ ...config, liveMode }, transport) };
}

describe('Mercado Pago sandbox Pix transport', () => {
  it('uses the reserved UUID, seller bearer token, exact amount and no platform commission', async () => {
    const { client, transport } = fixture({ ...response, payer: { email: 'test-payer@example.com' } });

    const result = await client.createSandboxPix(input);

    expect(result).toEqual({
      kind: 'PENDING',
      paymentId: '456789',
      accountId: input.accountId,
      issuanceId: input.issuanceId,
      amountInCents: 35001,
      currency: 'brl',
      liveMode: false,
      copyAndPaste: response.point_of_interaction.transaction_data.qr_code,
      expiresAt: input.expiresAt,
    });
    expect(transport).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/payments',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: 'Bearer fixture-access',
          'Content-Type': 'application/json',
          'X-Idempotency-Key': input.issuanceId,
        },
        body: JSON.stringify({
          transaction_amount: 350.01,
          description: 'Pagamento de serviço - Bom Trato',
          payment_method_id: 'pix',
          external_reference: input.issuanceId,
          date_of_expiration: input.expiresAt.toISOString(),
          payer: input.payer,
        }),
      }),
    );
  });

  it('rejects production before issuing any HTTP request', async () => {
    const { client, transport } = fixture(response, true);

    await expect(client.createSandboxPix(input)).rejects.toThrow('MODE_MISMATCH');
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    { issuanceId: 'new-key' },
    { amountInCents: 0 },
    { amountInCents: 1.5 },
    { expiresAt: new Date(0) },
    { accountId: '../wrong' },
    { payer: { email: 'invalid', identification: input.payer.identification } },
  ])('rejects invalid request before network I/O: %j', async (patch) => {
    const { client, transport } = fixture(response);

    await expect(client.createSandboxPix({ ...input, ...patch })).rejects.toThrow('INVALID_INPUT');
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    { collector_id: 123457 },
    { live_mode: true },
    { external_reference: 'another-reference' },
    { transaction_amount: '350.02' },
    { currency_id: 'USD' },
    { payment_method_id: 'visa' },
    { payment_type_id: 'credit_card' },
    { transaction_amount_refunded: 1 },
    { date_of_expiration: 'invalid' },
    { date_of_expiration: new Date(input.expiresAt.getTime() + 3600000).toISOString() },
    { point_of_interaction: { transaction_data: { qr_code: 'not-a-pix-code' } } },
  ])('rejects mismatched creation results: %j', async (patch) => {
    const { client } = fixture({ ...response, ...patch });

    await expect(client.createSandboxPix(input)).rejects.toThrow();
  });

  it.each(['approved', 'rejected', 'cancelled', 'in_process'])('does not offer a QR or confirm payment for %s', async (status) => {
    const { client } = fixture({ ...response, status });

    await expect(client.createSandboxPix(input)).resolves.toEqual({
      kind: 'REVIEW_REQUIRED',
      paymentId: '456789',
      accountId: input.accountId,
      issuanceId: input.issuanceId,
      amountInCents: input.amountInCents,
      currency: 'brl',
      liveMode: false,
    });
  });

  it('does not retry or leak the original error after an uncertain request', async () => {
    const { client, transport } = fixture(response);
    transport.mockRejectedValueOnce(new Error('private payer data or token'));

    await expect(client.createSandboxPix(input)).rejects.toThrow('REQUEST_FAILED');
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

describe('Mercado Pago live Pix transport (mock provider only)', () => {
  it('requires a live client and live response; keeps the reservation key and seller token', async () => {
    const { client, transport } = fixture({ ...response, live_mode: true }, true);

    await expect(client.createLivePix(input)).resolves.toMatchObject({
      kind: 'PENDING', liveMode: true, issuanceId: input.issuanceId, accountId: input.accountId, paymentId: '456789',
    });
    expect(transport).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/payments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer fixture-access',
          'X-Idempotency-Key': input.issuanceId,
        }),
        body: expect.stringContaining('"external_reference":"' + input.issuanceId + '"'),
      }),
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('cannot create a live payment with a sandbox client', async () => {
    const { client, transport } = fixture(response);
    await expect(client.createLivePix(input)).rejects.toThrow('MODE_MISMATCH');
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    { live_mode: false },
    { external_reference: 'different-reference' },
    { collector_id: 123457 },
    { transaction_amount: '350.02' },
    { transaction_amount_refunded: 1 },
  ])('rejects inconsistent live responses: %j', async (patch) => {
    const { client } = fixture({ ...response, live_mode: true, ...patch }, true);
    await expect(client.createLivePix(input)).rejects.toThrow();
  });

  it('never treats creation approval as confirmed settlement', async () => {
    const { client } = fixture({ ...response, live_mode: true, status: 'approved' }, true);
    await expect(client.createLivePix(input)).resolves.toEqual({
      kind: 'REVIEW_REQUIRED', paymentId: '456789', accountId: input.accountId,
      issuanceId: input.issuanceId, amountInCents: input.amountInCents, currency: 'brl', liveMode: true,
    });
  });
});
