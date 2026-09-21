import { safeError } from '../../../../infrastructure/logging/safeError.js';

const billingCodes = [
  'BILLING_BUSY',
  'BILLING_READ_FAILED',
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
] as const;

export function safeBillingError(error: unknown) {
  return safeError(error, billingCodes);
}
