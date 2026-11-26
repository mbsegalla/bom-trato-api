import { describe, expect, it, vi } from 'vitest';

import { BillingError } from '../../domain/errors/billing.error.js';

import { billingOperation } from './billingHttpError.js';

describe('billingOperation', () => {
  it.each([
    ['INVALID_WEBHOOK', 400],
    ['INVALID_CURSOR', 400],
    ['OWNER_REQUIRED', 403],
    ['EMAIL_NOT_VERIFIED', 403],
    ['SUBSCRIPTION_REQUIRED', 403],
    ['ORGANIZATION_NOT_FOUND', 404],
    ['SUBSCRIPTION_NOT_FOUND', 404],
    ['PAYMENT_METHOD_UPDATE_NOT_FOUND', 404],
    ['PLAN_CHANGE_NOT_FOUND', 404],
    ['PLAN_UNAVAILABLE', 409],
    ['PRICE_MISMATCH', 409],
    ['SUBSCRIPTION_EXISTS', 409],
    ['INVALID_SUBSCRIPTION_STATE', 409],
    ['CHECKOUT_IN_PROGRESS', 409],
    ['CHECKOUT_EXPIRED', 409],
    ['MULTIPLE_SUBSCRIPTIONS', 409],
    ['INVALID_PAYMENT_METHOD_UPDATE', 409],
    ['PLAN_CHANGE_CONFLICT', 409],
    ['PLAN_CHANGE_SAME_PRICE', 409],
    ['PLAN_CHANGE_QUOTE_EXPIRED', 409],
    ['PLAN_CHANGE_UNSUPPORTED', 409],
    ['PLAN_MEMBER_LIMIT', 409],
    ['BILLING_BUSY', 503],
    ['BILLING_RECONCILIATION_REQUIRED', 503],
    ['BILLING_READ_FAILED', 503],
    ['BILLING_WRITE_FAILED', 503],
    ['BILLING_PORTAL_UNAVAILABLE', 503],
  ] as const)('maps %s to HTTP %i without exposing its cause', async (code, status) => {
    const error = new BillingError(code, { cause: new Error('private provider failure') });

    await expect(billingOperation(() => Promise.reject(error))).rejects.toMatchObject({
      status,
      publicError: {
        code,
        message: expect.not.stringContaining('private provider failure'),
        details: [],
      },
    });
  });

  it('returns the original successful result and invokes the operation once', async () => {
    const result = { id: 'invoice' };
    const operation = vi.fn().mockResolvedValue(result);

    expect(await billingOperation(operation)).toBe(result);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('propagates unexpected errors without converting them to billing failures', async () => {
    const error = new Error('unexpected failure');

    await expect(billingOperation(() => Promise.reject(error))).rejects.toBe(error);
  });
});
