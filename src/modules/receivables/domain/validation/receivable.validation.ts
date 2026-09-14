import { ReceivableError } from '../errors/receivable.error.js';

export function assertReceivableAmount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) {
    throw new ReceivableError('INVALID_RECEIVABLE_AMOUNT');
  }
}

export function assertReceivableDate(value: Date): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new ReceivableError('INVALID_RECEIVABLE_DATE');
  }
}

export function normalizeReceivableText(value: string | null | undefined, maxLength: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new ReceivableError('INVALID_RECEIVABLE_INPUT');
  }

  return value.trim() || null;
}

export function normalizeReceivableReason(value: string): string {
  const reason = normalizeReceivableText(value, 1000);

  if (reason === null || reason.length < 3) {
    throw new ReceivableError('REASON_REQUIRED');
  }

  return reason;
}
