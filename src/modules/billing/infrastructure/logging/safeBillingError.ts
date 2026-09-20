const allowedCodes = new Set([
  'BILLING_BUSY',
  'BILLING_READ_FAILED',
  'BILLING_RECONCILIATION_REQUIRED',
  'MULTIPLE_SUBSCRIPTIONS',
  'SUBSCRIPTION_NOT_FOUND',
  'PLAN_CHANGE_NOT_FOUND',
  'INVALID_PAYMENT_METHOD_UPDATE',
  'PAYMENT_METHOD_UPDATE_NOT_FOUND',
  'WEBHOOK_PROCESSING_FAILED',
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2002',
  'P2003',
  'P2024',
  'P2025',
  'P2028',
  'P2034',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'api_connection_error',
  'api_error',
  'rate_limit',
  'resource_missing',
]);

function ownValue(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  try {
    const property = Object.getOwnPropertyDescriptor(value, key);

    return property !== undefined && 'value' in property ? property.value : undefined;
  } catch {
    return undefined;
  }
}

function allowedCode(value: unknown): string | undefined {
  return typeof value === 'string' && allowedCodes.has(value) ? value : undefined;
}

export function safeBillingError(error: unknown) {
  const cause = ownValue(error, 'cause');

  const status = ownValue(cause, 'statusCode') ?? ownValue(error, 'statusCode');

  return {
    errorCode: allowedCode(ownValue(error, 'code')) ?? 'UNEXPECTED_ERROR',

    causeCode: allowedCode(ownValue(cause, 'code')),

    upstreamStatus:
      typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined,
  };
}
