const infrastructureCodes = new Set([
  'P1000',
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
  'ERR_CRYPTO_INVALID_KEYLEN',
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

export function safeError(error: unknown, additionalCodes: readonly string[] = []) {
  const allowedCode = (value: unknown): string | undefined =>
    typeof value === 'string' && (infrastructureCodes.has(value) || additionalCodes.includes(value))
      ? value
      : undefined;

  const cause = ownValue(error, 'cause');
  const status = ownValue(cause, 'statusCode') ?? ownValue(error, 'statusCode');

  return {
    errorCode: allowedCode(ownValue(error, 'code')) ?? 'UNEXPECTED_ERROR',
    causeCode: allowedCode(ownValue(cause, 'code')),
    upstreamStatus:
      typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined,
  };
}
