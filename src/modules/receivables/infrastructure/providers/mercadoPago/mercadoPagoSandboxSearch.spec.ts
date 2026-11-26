import { describe, expect, it, vi } from 'vitest';

import { MercadoPagoClient } from './mercadoPagoClient.js';
import type { SearchMercadoPagoSandboxPixInput } from './mercadoPagoPix.types.js';

const input: SearchMercadoPagoSandboxPixInput = {
  issuanceId: '4586a4c1-924c-4a48-9949-a837e7540c2c',
  accountId: '123456',
  accessToken: 'fixture-access',
  amountInCents: 35001,
};
const candidate = { id: 456789, external_reference: input.issuanceId };
const payment = {
  ...candidate,
  collector_id: 123456,
  live_mode: false,
  payment_method_id: 'pix',
  payment_type_id: 'bank_transfer',
  currency_id: 'BRL',
  transaction_amount: '350.01',
  transaction_amount_refunded: 0,
  status: 'pending',
  status_detail: 'pending_waiting_transfer',
};

function fixture(results: unknown[], total = results.length, result: unknown = payment, liveMode = false) {
  const transport = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ paging: { total, offset: 0, limit: 2 }, results }))
    .mockResolvedValueOnce(Response.json(result));
  const client = new MercadoPagoClient({
    clientId: '123456789',
    clientSecret: 'fixture-secret',
    redirectUri: 'https://example.com/mercado-pago/callback',
    liveMode,
  }, transport);

  return { client, transport };
}

describe('sandbox Pix recovery search', () => {
  it('searches only the immutable reference and separately verifies a single result', async () => {
    const { client, transport } = fixture([candidate]);

    await expect(client.searchSandboxPix(input)).resolves.toEqual({
      kind: 'FOUND',
      paymentId: '456789',
      status: 'PENDING'
    });
    expect(transport).toHaveBeenNthCalledWith(
      1, expect.stringContaining('/v1/payments/search?external_reference=' + input.issuanceId),
      expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer fixture-access' } }),
    );
    expect(transport).toHaveBeenNthCalledWith(
      2, 'https://api.mercadopago.com/v1/payments/456789',
      expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer fixture-access' } }),
    );
  });

  it('does not resolve an empty or ambiguous search into a payment', async () => {
    const empty = fixture([]);

    await expect(empty.client.searchSandboxPix(input)).resolves.toEqual({ kind: 'NOT_FOUND' });
    expect(empty.transport).toHaveBeenCalledTimes(1);

    const multiple = fixture([candidate, { ...candidate, id: 456790 }], 5);

    await expect(multiple.client.searchSandboxPix(input)).resolves.toEqual({ kind: 'AMBIGUOUS' });
    expect(multiple.transport).toHaveBeenCalledTimes(1);
  });

  it('rejects inconsistent pagination or mismatched references', async () => {
    await expect(fixture([candidate], 2).client.searchSandboxPix(input)).rejects.toThrow('INVALID_RESPONSE');
    await expect(fixture([{ ...candidate, external_reference: 'wrong' }]).client.searchSandboxPix(input))
      .rejects.toThrow('INVALID_RESPONSE');
  });

  it.each([
    { collector_id: 999999 },
    { live_mode: true },
    { transaction_amount: '350.02' },
    { external_reference: 'wrong' }
  ])(
    'rejects a search hit whose authoritative payment is inconsistent: %j',
    async (patch) => {
      await expect(fixture([candidate], 1, { ...payment, ...patch }).client.searchSandboxPix(input)).rejects.toThrow();
    },
  );

  it('does not query the provider in live mode', async () => {
    const { client, transport } = fixture([candidate], 1, payment, true);

    await expect(client.searchSandboxPix(input)).rejects.toThrow('MODE_MISMATCH');
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('live Pix recovery search (mock provider only)', () => {
  const liveInput = { ...input, eventId: 'recovery-fixture' };

  it('requires live mode and verifies the unique result via individual lookup', async () => {
    const found = fixture([candidate], 1, { ...payment, live_mode: true }, true);

    await expect(found.client.searchLivePix(liveInput)).resolves.toEqual({
      kind: 'FOUND',
      paymentId: '456789',
      observation: { status: 'PENDING' },
    });
    expect(found.transport).toHaveBeenCalledTimes(2);

    const mismatch = fixture([candidate], 1, payment, true);

    await expect(mismatch.client.searchLivePix(liveInput)).rejects.toThrow('MODE_MISMATCH');

    const sandbox = fixture([candidate]);

    await expect(sandbox.client.searchLivePix(liveInput)).rejects.toThrow('MODE_MISMATCH');
    expect(sandbox.transport).not.toHaveBeenCalled();
  });

  it('never uses an ambiguous search result to confirm a live charge', async () => {
    const ambiguous = fixture([candidate, { ...candidate, id: 456790 }], 2, payment, true);

    await expect(ambiguous.client.searchLivePix(liveInput)).resolves.toEqual({ kind: 'AMBIGUOUS' });
    expect(ambiguous.transport).toHaveBeenCalledTimes(1);
  });
});
