import { ReceivingSettingsError } from '../errors/receivingSettings.error.js';
import type { PixKeyType } from '../types/receivingSettings.types.js';
import { normalizePixKey } from './receivingSettings.policy.js';

interface PixChargeInput {
  receivableId: string;
  currency: string;
  status: string;
  amountInCents: number;
  receivedInCents: number;
  pixKeyType: PixKeyType;
  pixKey: string;
  merchantName: string;
  merchantCity: string;
}

function unavailable(): never {
  throw new ReceivingSettingsError('PIX_CHARGE_NOT_AVAILABLE');
}

function field(id: string, value: string): string {
  if (!/^\d{2}$/.test(id) || value.length === 0 || value.length > 99 || !/^[\x20-\x7E]+$/.test(value)) {
    return unavailable();
  }

  return id + value.length.toString().padStart(2, '0') + value;
}

export function pixCrc16(payload: string): string {
  let crc = 0xffff;

  for (let index = 0; index < payload.length; index++) {
    crc ^= payload.charCodeAt(index) << 8;

    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc << 1) ^ ((crc & 0x8000) !== 0 ? 0x1021 : 0)) & 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function receivablePixTxid(receivableId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receivableId)) {
    return unavailable();
  }

  // Full 128-bit identifier, losslessly encoded in 25 alphanumeric characters.
  return BigInt(`0x${receivableId.replaceAll('-', '')}`).toString(36).toUpperCase().padStart(25, '0');
}

export function createReceivablePixCharge(input: PixChargeInput): {
  amountInCents: number;
  txid: string;
  copyAndPaste: string;
} {
  const { status, currency, amountInCents, receivedInCents, merchantName, merchantCity } = input;
  const balance = amountInCents - receivedInCents;

  if (
    currency !== 'brl' ||
    (status !== 'OPEN' && status !== 'PARTIALLY_PAID') ||
    !Number.isSafeInteger(amountInCents) ||
    amountInCents <= 0 ||
    amountInCents > 2147483647 ||
    !Number.isSafeInteger(receivedInCents) ||
    receivedInCents < 0 ||
    balance <= 0 ||
    (status === 'OPEN' && receivedInCents !== 0) ||
    (status === 'PARTIALLY_PAID' && receivedInCents === 0)
  ) {
    return unavailable();
  }

  if (
    merchantName.length > 25 ||
    merchantCity.length > 15 ||
    !/^[A-Z0-9 .&'()-]+$/.test(merchantName) ||
    !/^[A-Z0-9 .&'()-]+$/.test(merchantCity) ||
    !/[A-Z0-9]/.test(merchantName) ||
    !/[A-Z0-9]/.test(merchantCity)
  ) {
    return unavailable();
  }

  const key = normalizePixKey(input.pixKeyType, input.pixKey);
  const txid = receivablePixTxid(input.receivableId);
  const amount = `${Math.floor(balance / 100)}.${(balance % 100).toString().padStart(2, '0')}`;
  const payload = [
    field('00', '01'),
    field('26', field('00', 'br.gov.bcb.pix') + field('01', key)),
    field('52', '0000'),
    field('53', '986'),
    field('54', amount),
    field('58', 'BR'),
    field('59', merchantName),
    field('60', merchantCity),
    field('62', field('05', txid)),
    '6304',
  ].join('');

  return { amountInCents: balance, txid, copyAndPaste: payload + pixCrc16(payload) };
}
