import { ReceivingSettingsError } from '../errors/receivingSettings.error.js';
import type { PixKeyType, ReceivingSettings, SaveReceivingSettingsInput } from '../types/receivingSettings.types.js';

const emailPattern =
  /^[a-z0-9.!#$'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const evpPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function invalid(): never {
  throw new ReceivingSettingsError('INVALID_RECEIVING_SETTINGS');
}

export function normalizePixKey(type: PixKeyType, raw: string): string {
  const value = raw.trim();
  let normalized: string;

  switch (type) {
    case 'CPF':
      if (!/^[0-9.-]+$/.test(value)) {
        return invalid();
      }
      normalized = value.replace(/[.-]/g, '');
      if (!/^\d{11}$/.test(normalized)) {
        return invalid();
      }
      return normalized;

    case 'CNPJ':
      if (!/^[a-zA-Z0-9./-]+$/.test(value)) {
        return invalid();
      }
      normalized = value.replace(/[./-]/g, '').toUpperCase();
      if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(normalized)) {
        return invalid();
      }
      return normalized;

    case 'PHONE':
      if (!/^\+[0-9 ().-]+$/.test(value)) {
        return invalid();
      }
      normalized = value.replace(/[ ().-]/g, '');
      if (!/^\+[1-9]\d{1,14}$/.test(normalized)) {
        return invalid();
      }
      return normalized;

    case 'EMAIL':
      normalized = value.toLowerCase();
      if (normalized.length > 77 || !emailPattern.test(normalized)) {
        return invalid();
      }
      return normalized;

    case 'EVP':
      normalized = value.toLowerCase();
      if (!evpPattern.test(normalized)) {
        return invalid();
      }
      return normalized;

    default:
      return invalid();
  }
}

function normalizeMerchantField(value: string, maxLength: number): string {
  const normalized = value.normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/ +/g, ' ').toUpperCase();

  if (
    normalized.length < 1 ||
    normalized.length > maxLength ||
    !/^[A-Z0-9 .&'()-]+$/.test(normalized) ||
    !/[A-Z0-9]/.test(normalized)
  ) {
    return invalid();
  }

  return normalized;
}

export class ReceivingSettingsPolicy {
  static configure(input: SaveReceivingSettingsInput, currentVersion: number): ReceivingSettings {
    if (
      !Number.isSafeInteger(input.version) ||
      input.version < 0 ||
      input.version !== currentVersion ||
      currentVersion >= 2147483647
    ) {
      throw new ReceivingSettingsError('RECEIVING_SETTINGS_VERSION_CONFLICT');
    }

    if (typeof input.pixEnabled !== 'boolean' || typeof input.confirmed !== 'boolean') {
      return invalid();
    }

    if (!input.pixEnabled) {
      if (
        input.pixKeyType !== null ||
        input.pixKey !== null ||
        input.merchantName !== null ||
        input.merchantCity !== null ||
        input.confirmed
      ) {
        return invalid();
      }

      return { pixEnabled: false, pixKeyType: null, pixKey: null, merchantName: null, merchantCity: null };
    }

    if (
      !input.confirmed ||
      input.pixKeyType === null ||
      typeof input.pixKey !== 'string' ||
      input.pixKey.length > 150 ||
      typeof input.merchantName !== 'string' ||
      input.merchantName.length > 100 ||
      typeof input.merchantCity !== 'string' ||
      input.merchantCity.length > 100
    ) {
      return invalid();
    }

    return {
      pixEnabled: true,
      pixKeyType: input.pixKeyType,
      pixKey: normalizePixKey(input.pixKeyType, input.pixKey),
      merchantName: normalizeMerchantField(input.merchantName, 25),
      merchantCity: normalizeMerchantField(input.merchantCity, 15),
    };
  }
}
