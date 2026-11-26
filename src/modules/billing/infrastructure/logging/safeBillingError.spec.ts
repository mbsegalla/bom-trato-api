import { describe, expect, it } from 'vitest';

import { safeBillingError } from './safeBillingError.js';

describe('safeBillingError', () => {
  it.each([
    'BILLING_BUSY',
    'BILLING_READ_FAILED',
    'BILLING_WRITE_FAILED',
    'BILLING_RECONCILIATION_REQUIRED',
    'MULTIPLE_SUBSCRIPTIONS',
    'SUBSCRIPTION_NOT_FOUND',
    'PLAN_CHANGE_NOT_FOUND',
    'INVALID_PAYMENT_METHOD_UPDATE',
    'PAYMENT_METHOD_UPDATE_NOT_FOUND',
    'WEBHOOK_PROCESSING_FAILED',
    'api_connection_error',
    'api_error',
    'rate_limit',
    'resource_missing',
    'P2034',
    'ETIMEDOUT',
  ])('preserves the allowlisted code %s', (code) => {
    expect(safeBillingError({ code }).errorCode).toBe(code);
  });

  it('redacts credentials in provider errors and nested causes', () => {
    const error = Object.assign(new Error('Authorization: Bearer example-secret'), {
      code: 'BILLING_WRITE_FAILED',
      cause: { code: 'rate_limit', message: 'password=private-value', statusCode: 429 },
    });
    const result = safeBillingError(error);

    expect(result).toMatchObject({
      errorCode: 'BILLING_WRITE_FAILED',
      causeCode: 'rate_limit',
      causeMessage: 'password=[REDACTED]',
      upstreamStatus: 429,
    });
    expect(JSON.stringify(result)).not.toContain('example-secret');
    expect(JSON.stringify(result)).not.toContain('private-value');
  });

  it.each([200, 399, 600, 429.5, '429', null])('rejects invalid upstream status %s', (statusCode) => {
    expect(safeBillingError({ statusCode }).upstreamStatus).toBeUndefined();
  });

  it('does not leak unrecognized codes or arbitrary provider payloads', () => {
    const result = safeBillingError({
      code: 'private-customer-reference',
      raw: { token: 'private-token' },
      cause: { code: 'unknown-provider-code' },
    });

    expect(result.errorCode).toBe('UNEXPECTED_ERROR');
    expect(result.causeCode).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('private-');
  });
});
