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

const maxMessageLength = 4000;
const maxStackLength = 12000;

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

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function sanitize(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\bBasic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1[REDACTED]@')
    .replace(
      /(["']?(?:authorization|cookie|credential|password|passwd|secret|token|api[-_]?key|client[-_]?secret|access[-_]?token|refresh[-_]?token)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      '$1[REDACTED]',
    )
    .replace(
      /([?&](?:authorization|cookie|credential|password|passwd|secret|token|api[-_]?key|client[-_]?secret|access[-_]?token|refresh[-_]?token)=)[^&#\s]*/gi,
      '$1[REDACTED]',
    );
}

export function safeLogText(value: unknown, maxLength = maxMessageLength): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();

  return normalized ? truncate(sanitize(normalized), maxLength) : undefined;
}

function errorName(error: unknown): string | undefined {
  if (error instanceof Error) {
    return safeLogText(error.name, 200);
  }

  return safeLogText(ownValue(error, 'name'), 200);
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return safeLogText(error.message);
  }

  if (typeof error === 'string') {
    return safeLogText(error);
  }

  return safeLogText(ownValue(error, 'message'));
}

function errorStack(error: unknown, name: string | undefined, message: string | undefined): string | undefined {
  const stack = error instanceof Error ? error.stack : ownValue(error, 'stack');

  if (typeof stack !== 'string' || !stack.trim()) {
    return undefined;
  }

  const stackFrames = stack.split('\n').filter((line) => line.trimStart().startsWith('at '));
  const firstLine = name && message ? `${name}: ${message}` : (name ?? message ?? 'Error');

  return safeLogText([firstLine, ...stackFrames].join('\n'), maxStackLength);
}

export function safeError(error: unknown, additionalCodes: readonly string[] = []) {
  const allowedCode = (value: unknown): string | undefined =>
    typeof value === 'string' && (infrastructureCodes.has(value) || additionalCodes.includes(value))
      ? value
      : undefined;

  const cause = ownValue(error, 'cause');
  const status = ownValue(cause, 'statusCode') ?? ownValue(error, 'statusCode');

  const name = errorName(error);
  const message = errorMessage(error);

  const causeName = errorName(cause);
  const causeMessage = errorMessage(cause);

  return {
    errorCode: allowedCode(ownValue(error, 'code')) ?? 'UNEXPECTED_ERROR',
    errorName: name,
    errorMessage: message,
    errorStack: errorStack(error, name, message),
    causeCode: allowedCode(ownValue(cause, 'code')),
    causeName,
    causeMessage,
    causeStack: errorStack(cause, causeName, causeMessage),
    upstreamStatus:
      typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined,
  };
}
