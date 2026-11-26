import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { verifyMercadoPagoWebhook } from './mercadoPagoWebhook.policy.js';

const clientId = '12345';
const secret = 'webhook-test-secret-not-real';
const now = new Date('2026-11-25T15:00:00Z');
const requestId = 'delivery-123';
const paymentId = '999999999';
const timestamp = String(now.getTime());
const originalUrl = '/api/receivables/webhooks/mercado-pago?data.id=' + paymentId + '&type=payment';

function sign(ts = timestamp, id = paymentId, request = requestId): string {
  const manifest = 'id:' + id + ';request-id:' + request + ';ts:' + ts + ';';
  return 'ts=' + ts + ',v1=' + createHmac('sha256', secret).update(manifest).digest('hex');
}

function verify(overrides: Partial<Parameters<typeof verifyMercadoPagoWebhook>[0]> = {}) {
  return verifyMercadoPagoWebhook(
    {
      originalUrl,
      signature: sign(),
      requestId,
      ...overrides,
    },
    clientId,
    secret,
    now,
  );
}

describe('Mercado Pago signed webhook delivery', () => {
  it('normalizes signed metadata and uses a stable key for exact retries', () => {
    const notice = verify();

    expect(notice).toEqual({
      clientId,
      deliveryKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      paymentId,
      requestId,
      signedAt: now,
    });
    expect(verify()).toEqual(notice);
    expect(verify({ requestId: 'other', signature: sign(timestamp, paymentId, 'other') })?.deliveryKey).not.toBe(
      notice?.deliveryKey,
    );
  });

  it('supports both documented timestamp units and historical signed retries', () => {
    const ts = String(Math.floor(now.getTime() / 1000) - 86400);

    expect(verify({ signature: sign(ts) })?.signedAt).toEqual(new Date(now.getTime() - 86400000));
  });

  it('rejects a forged signature, changed ID or changed request ID', () => {
    expect(verify({ signature: sign(timestamp, '123456789') })).toBeNull();
    expect(verify({ originalUrl: originalUrl.replace(paymentId, '123456789') })).toBeNull();
    expect(verify({ requestId: 'forged' })).toBeNull();
    expect(verify({ signature: undefined })).toBeNull();
    expect(verify({ requestId: undefined })).toBeNull();
  });

  it('rejects ambiguous inputs, wrong topics and implausible future timestamps', () => {
    expect(verify({ originalUrl: originalUrl + '&data.id=' + paymentId })).toBeNull();
    expect(verify({ originalUrl: originalUrl.replace('type=payment', 'type=merchant_order') })).toBeNull();
    expect(verify({ signature: sign() + ',ts=' + timestamp })).toBeNull();
    expect(verify({ requestId: [requestId, requestId] })).toBeNull();
    expect(verify({ signature: sign(String(now.getTime() + 3600000)) })).toBeNull();
    expect(verify({ signature: 'ts=' + timestamp + ',v1=invalid' })).toBeNull();
  });
});
