import type {
  CreateMercadoPagoSandboxPixInput,
  SandboxPixViewStatus,
} from '../../application/types/mercadoPagoSandboxPix.types.js';
import { ReceivingSettingsError } from '../errors/receivingSettings.error.js';

import { pixCrc16 } from './receivablePixCharge.policy.js';

export const SANDBOX_PIX_EXPIRY_MS = 60 * 60 * 1000;
export const SANDBOX_PIX_PROCESSING_MS = 2 * 60 * 1000;

interface ReceivableSnapshot {
  version: number;
  status: string;
  currency: string;
  amountInCents: number;
  receivedInCents: number;
}

interface IssuanceSnapshot {
  status: 'RESERVED' | 'PENDING' | 'REVIEW_REQUIRED';
  receivableVersion: number;
  amountInCents: number;
  createdAt: Date;
  expiresAt: Date | null;
}

export function sandboxPixBalance(receivable: ReceivableSnapshot): number {
  const balance = receivable.amountInCents - receivable.receivedInCents;

  return receivable.currency === 'brl' &&
    (receivable.status === 'OPEN' || receivable.status === 'PARTIALLY_PAID') &&
    Number.isSafeInteger(receivable.amountInCents) &&
    receivable.amountInCents > 0 &&
    receivable.amountInCents <= 2147483647 &&
    Number.isSafeInteger(receivable.receivedInCents) &&
    receivable.receivedInCents >= 0 &&
    (receivable.status === 'OPEN' ? receivable.receivedInCents === 0 : receivable.receivedInCents > 0) &&
    balance > 0
    ? balance
    : 0;
}

export function assertSandboxPixInput(input: CreateMercadoPagoSandboxPixInput): void {
  if (
    !Number.isSafeInteger(input.version) ||
    input.version < 1 ||
    input.version > 2147483647 ||
    input.confirmed !== true ||
    typeof input.testBuyerEmail !== 'string' ||
    input.testBuyerEmail.length > 254 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.testBuyerEmail) ||
    (input.testDocumentType !== 'CPF' && input.testDocumentType !== 'CNPJ') ||
    typeof input.testDocumentNumber !== 'string' ||
    !(input.testDocumentType === 'CPF' ? /^\d{11}$/ : /^\d{14}$/).test(input.testDocumentNumber)
  ) {
    throw new ReceivingSettingsError('MERCADO_PAGO_PIX_INVALID');
  }
}

export function sandboxPixStatus(
  issuance: IssuanceSnapshot | null,
  receivable: ReceivableSnapshot,
  connectionCurrent: boolean,
  now: Date,
): SandboxPixViewStatus {
  if (issuance === null) {
    return 'NOT_ISSUED';
  }
  if (issuance.status === 'REVIEW_REQUIRED') {
    return 'REVIEW_REQUIRED';
  }
  if (issuance.status === 'RESERVED') {
    return now.getTime() - issuance.createdAt.getTime() < SANDBOX_PIX_PROCESSING_MS ? 'PROCESSING' : 'REVIEW_REQUIRED';
  }
  if (issuance.expiresAt === null || issuance.expiresAt <= now) {
    return 'EXPIRED';
  }
  if (
    !connectionCurrent ||
    issuance.receivableVersion !== receivable.version ||
    issuance.amountInCents !== sandboxPixBalance(receivable)
  ) {
    return 'STALE';
  }

  return 'PENDING';
}

function readFields(payload: string): Map<string, string> | null {
  const fields = new Map<string, string>();
  let cursor = 0;
  while (cursor < payload.length) {
    const header = payload.slice(cursor, cursor + 4);
    if (!/^\d{4}$/.test(header)) {
      return null;
    }
    const id = header.slice(0, 2);
    const length = Number(header.slice(2));
    cursor += 4;
    if (length === 0 || cursor + length > payload.length || fields.has(id)) {
      return null;
    }
    fields.set(id, payload.slice(cursor, cursor + length));
    cursor += length;
  }
  return fields;
}

// Validate structure and CRC, not the external Pix location's ownership.
// The API response must separately be authenticated and bound to the seller.
export function isValidSandboxDynamicPix(code: string, amountInCents: number): boolean {
  if (code.length > 1024 || !/^000201[\x20-\x7E]+6304[0-9A-Fa-f]{4}$/.test(code)) {
    return false;
  }
  if (pixCrc16(code.slice(0, -4)) !== code.slice(-4).toUpperCase()) {
    return false;
  }

  const fields = readFields(code);
  if (
    !fields ||
    fields.get('00') !== '01' ||
    fields.get('01') !== '12' ||
    fields.get('53') !== '986' ||
    fields.get('58') !== 'BR' ||
    !/^\d{4}$/.test(fields.get('52') ?? '') ||
    !fields.get('59') ||
    !fields.get('60') ||
    !fields.get('63')
  ) {
    return false;
  }

  const amount = fields.get('54');
  if (amount !== undefined) {
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount)) {
      return false;
    }
    const [whole, decimal = ''] = amount.split('.');
    if (Number(whole) * 100 + Number(decimal.padEnd(2, '0')) !== amountInCents) {
      return false;
    }
  }

  const additional = readFields(fields.get('62') ?? '');
  if (!additional?.get('05')) {
    return false;
  }

  let pixTemplates = 0;
  for (const [id, value] of fields) {
    if (Number(id) < 26 || Number(id) > 51) {
      continue;
    }
    const template = readFields(value);
    if (!template) {
      return false;
    }
    if (template.get('00')?.toLowerCase() !== 'br.gov.bcb.pix') {
      continue;
    }
    if (!template.get('25') || template.has('01')) {
      return false;
    }
    pixTemplates++;
  }
  return pixTemplates === 1;
}
