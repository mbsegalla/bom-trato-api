import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import type { MercadoPagoWebhookNotice } from '../types/mercadoPagoWebhook.types.js';

interface WebhookInput {
  originalUrl: string;
  signature: string | string[] | undefined;
  requestId: string | string[] | undefined;
}

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export function verifyMercadoPagoWebhook(
  input: WebhookInput,
  clientId: string,
  secret: string,
  now: Date,
): MercadoPagoWebhookNotice | null {
  if (
    !/^[1-9]\d{0,29}$/.test(clientId) ||
    !/^[\x21-\x7E]{16,2048}$/.test(secret) ||
    typeof input.signature !== 'string' ||
    input.signature.length > 256 ||
    typeof input.requestId !== 'string' ||
    !/^[A-Za-z0-9._-]{1,200}$/.test(input.requestId)
  ) {
    return null;
  }

  // Read the exact URL parameter, independently of Express query parsing.
  const queryStart = input.originalUrl.indexOf('?');

  if (queryStart === -1 || input.originalUrl.length > 4096) {
    return null;
  }

  const params = new URLSearchParams(input.originalUrl.slice(queryStart + 1));
  const ids = params.getAll('data.id');
  const types = params.getAll('type');
  const paymentId = ids[0];

  if (
    ids.length !== 1 ||
    paymentId === undefined ||
    !/^[1-9]\d{0,29}$/.test(paymentId) ||
    types.length > 1 ||
    (types.length === 1 && types[0] !== 'payment')
  ) {
    return null;
  }

  const parts = new Map<string, string>();

  for (const part of input.signature.split(',')) {
    const [rawKey, rawValue, extra] = part.split('=');
    const key = rawKey?.trim();
    const value = rawValue?.trim();

    if (extra !== undefined || !key || !value || parts.has(key) || (key !== 'ts' && key !== 'v1')) {
      return null;
    }

    parts.set(key, value);
  }

  const timestamp = parts.get('ts');
  const signature = parts.get('v1');

  if (
    !timestamp ||
    !signature ||
    !/^(?:[1-9]\d{9}|[1-9]\d{12})$/.test(timestamp) ||
    !/^[a-fA-F0-9]{64}$/.test(signature)
  ) {
    return null;
  }

  const timestampMs = Number(timestamp) * (timestamp.length === 10 ? 1000 : 1);

  // Allow historical signed retries during outages. Exact signed deliveries
  // are deduplicated durably; a notification is never a payment confirmation.
  if (!Number.isFinite(now.getTime()) || timestampMs > now.getTime() + MAX_FUTURE_SKEW_MS) {
    return null;
  }

  const manifest = 'id:' + paymentId + ';request-id:' + input.requestId + ';ts:' + timestamp + ';';
  const expected = createHmac('sha256', secret).update(manifest).digest();

  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
    return null;
  }

  return {
    clientId,
    deliveryKey: createHash('sha256').update(manifest).digest('hex'),
    paymentId,
    requestId: input.requestId,
    signedAt: new Date(timestampMs),
  };
}
