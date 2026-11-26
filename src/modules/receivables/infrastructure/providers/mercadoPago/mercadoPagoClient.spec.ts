import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { MercadoPagoClient } from './mercadoPagoClient.js';

const config = {
  clientId: '123456789',
  clientSecret: 'fixture-secret',
  redirectUri: 'https://example.com/settings/mercado-pago/callback',
  liveMode: false,
};
const tokenResponse = {
  access_token: 'fixture-access',
  refresh_token: 'fixture-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  scope: 'read write offline_access',
  user_id: 123456,
  live_mode: false,
};
const lookup = {
  accountId: '123456',
  paymentId: '456789',
  eventId: 'event-1',
  accessToken: 'fixture-access',
};
const paymentResponse = {
  id: 456789,
  collector_id: 123456,
  live_mode: false,
  status: 'approved',
  status_detail: 'accredited',
  payment_method_id: 'pix',
  payment_type_id: 'bank_transfer',
  transaction_amount: '350.01',
  transaction_amount_refunded: 0,
  currency_id: 'BRL',
  date_approved: '2025-01-01T12:00:00-03:00',
};

function fixture(payload: unknown, status = 200) {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload, { status }));

  return { transport, client: new MercadoPagoClient(config, transport) };
}

describe('Mercado Pago client', () => {
  it('uses random state and PKCE S256 without exposing the secret or verifier', () => {
    const { client, transport } = fixture(null);
    const first = client.createAuthorizationRequest();
    const second = client.createAuthorizationRequest();
    const url = new URL(first.url);

    expect(url.origin).toBe('https://auth.mercadopago.com');
    expect(url.searchParams.get('state')).toBe(first.state);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(first.verifier).digest('base64url'),
    );
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(first.state).not.toBe(second.state);
    expect(first.verifier).not.toBe(second.verifier);
    expect(first.url).not.toContain(first.verifier);
    expect(first.url).not.toContain(config.clientSecret);
    expect(transport).not.toHaveBeenCalled();
  });

  it('exchanges a code server-side and requires the sandbox response', async () => {
    const { client, transport } = fixture(tokenResponse);
    const result = await client.exchangeCode('fixture-code', 'a'.repeat(43));

    expect(result).toMatchObject({
      accountId: '123456',
      accessToken: 'fixture-access',
      refreshToken: 'fixture-refresh',
      liveMode: false,
    });
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(transport).toHaveBeenCalledWith(
      'https://api.mercadopago.com/oauth/token',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: 'fixture-code',
          code_verifier: 'a'.repeat(43),
          redirect_uri: config.redirectUri,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          test_token: 'true',
        }),
      }),
    );
  });

  it('returns both rotated credentials on refresh and rejects another account', async () => {
    const { client } = fixture({ ...tokenResponse, refresh_token: 'rotated-refresh', access_token: 'rotated-access' });

    await expect(client.refreshCredentials('123456', 'old-refresh')).resolves.toMatchObject({
      accessToken: 'rotated-access',
      refreshToken: 'rotated-refresh',
    });

    const wrong = fixture(tokenResponse);

    await expect(wrong.client.refreshCredentials('654321', 'old-refresh')).rejects.toThrow('ACCOUNT_MISMATCH');
  });

  it.each([
    { live_mode: true },
    { scope: 'read write' },
    { refresh_token: null },
    { expires_in: -1 },
    { user_id: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects invalid OAuth responses: %j', async (patch) => {
    const { client } = fixture({ ...tokenResponse, ...patch });

    await expect(client.exchangeCode('fixture-code', 'a'.repeat(43))).rejects.toThrow();
  });

  it('reads the provider payment using the seller token and exact cents, without returning payer data', async () => {
    const { client, transport } = fixture({ ...paymentResponse, payer: { email: 'private@example.com' } });

    await expect(client.readApprovedPixPayment(lookup)).resolves.toEqual({
      provider: 'mercado-pago',
      externalAccountId: '123456',
      externalPaymentId: '456789',
      liveMode: false,
      eventId: 'event-1',
      amountInCents: 35001,
      currency: 'brl',
      paidAt: new Date('2025-01-01T15:00:00Z'),
    });
    expect(transport).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/payments/456789',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer fixture-access' },
        redirect: 'error',
      }),
    );
  });

  it.each([
    { status: 'pending' },
    { status_detail: 'pending_contingency' },
    { payment_method_id: 'visa' },
    { payment_type_id: 'credit_card' },
    { transaction_amount_refunded: '0.01' },
  ])('does not emit a confirmation for an ineligible payment: %j', async (patch) => {
    const { client } = fixture({ ...paymentResponse, ...patch });

    await expect(client.readApprovedPixPayment(lookup)).resolves.toBeNull();
  });

  it.each([
    { collector_id: 987654 },
    { id: 111111 },
    { live_mode: true },
    { transaction_amount: '350.001' },
    { transaction_amount: 0 },
    { date_approved: 'invalid' },
    { currency_id: 'invalid' },
    { transaction_amount_refunded: null },
  ])('fails closed on malformed or mismatched payment data: %j', async (patch) => {
    const { client } = fixture({ ...paymentResponse, ...patch });

    await expect(client.readApprovedPixPayment(lookup)).rejects.toThrow();
  });

  it('does not allow payment IDs to change the request destination', async () => {
    const { client, transport } = fixture(null);

    await expect(client.readApprovedPixPayment({ ...lookup, paymentId: '../oauth/token' })).rejects.toThrow(
      'INVALID_INPUT',
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it('sanitizes provider and transport failures without including credentials', async () => {
    const { client, transport } = fixture({ message: 'private-provider-response' }, 401);

    await expect(client.readApprovedPixPayment(lookup)).rejects.toMatchObject({
      message: 'REQUEST_FAILED',
      status: 401,
    });

    transport.mockRejectedValueOnce(new Error('fixture-access'));

    await expect(client.readApprovedPixPayment(lookup)).rejects.toThrow('REQUEST_FAILED');
  });

  it('requires an HTTPS callback without dynamic query, fragment or embedded credentials', () => {
    for (const redirectUri of [
      'http://example.com/callback',
      'https://example.com/callback?organization=1',
      'https://example.com/callback#token',
      'https://user:secret@example.com/callback',
    ]) {
      expect(() => new MercadoPagoClient({ ...config, redirectUri })).toThrow('INVALID_INPUT');
    }
  });
});
