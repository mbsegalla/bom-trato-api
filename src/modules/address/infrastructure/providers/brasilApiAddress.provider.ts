import { Injectable } from '@nestjs/common';

import type { AddressProvider } from '../../application/ports/addressProvider.port.js';
import { AddressError } from '../../domain/errors/address.error.js';
import type { AddressLookup, BrazilianCity } from '../../domain/types/address.types.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

type JsonRecord = Record<string, unknown>;

const postalCodeCache = new Map<string, CacheEntry<AddressLookup>>();

const citiesCache = new Map<string, CacheEntry<BrazilianCity[]>>();

const POSTAL_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const CITIES_TTL_MS = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string): string {
  const value = record[key];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AddressError('ADDRESS_PROVIDER_INVALID_RESPONSE');
  }

  return value.trim();
}

function nullableString(record: JsonRecord, key: string): string | null {
  const value = record[key];

  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new AddressError('ADDRESS_PROVIDER_INVALID_RESPONSE');
  }

  return value.trim() || null;
}

function identifier(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return String(value);
  }

  return null;
}

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);

    return null;
  }

  return entry.value;
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttl: number): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttl,
  });
}

@Injectable()
export class BrasilApiAddressProvider implements AddressProvider {
  private readonly baseUrl = new URL('https://brasilapi.com.br/api/');

  private readonly timeoutMs = 5000;

  async findByPostalCode(postalCode: string): Promise<AddressLookup | null> {
    const cached = readCache(postalCodeCache, postalCode);

    if (cached) {
      return structuredClone(cached);
    }

    const response = await this.request(`cep/v1/${encodeURIComponent(postalCode)}`);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new AddressError('ADDRESS_PROVIDER_UNAVAILABLE');
    }

    const payload = await this.readJson(response);

    if (!isRecord(payload)) {
      throw new AddressError('ADDRESS_PROVIDER_INVALID_RESPONSE');
    }

    const ibge = isRecord(payload.ibge) ? payload.ibge : null;

    const result: AddressLookup = {
      postalCode: requiredString(payload, 'cep').replace(/\D/g, ''),
      street: nullableString(payload, 'street'),
      neighborhood: nullableString(payload, 'neighborhood'),
      city: requiredString(payload, 'city'),
      state: requiredString(payload, 'state').toUpperCase(),
      cityIbgeCode: ibge ? identifier(ibge.city) : null,
      stateIbgeCode: ibge ? identifier(ibge.state) : null,
    };

    if (!/^\d{8}$/.test(result.postalCode) || !/^[A-Z]{2}$/.test(result.state)) {
      throw new AddressError('ADDRESS_PROVIDER_INVALID_RESPONSE');
    }

    writeCache(postalCodeCache, postalCode, result, POSTAL_CODE_TTL_MS);

    return structuredClone(result);
  }

  async listCities(state: string): Promise<BrazilianCity[]> {
    const cached = readCache(citiesCache, state);

    if (cached) {
      return cached.map((city) => ({ ...city }));
    }

    const path = `ibge/municipios/v1/${encodeURIComponent(state)}?providers=gov`;

    const response = await this.request(path);

    if (!response.ok) {
      throw new AddressError('ADDRESS_PROVIDER_UNAVAILABLE');
    }

    const payload = await this.readJson(response);

    if (!Array.isArray(payload)) {
      throw new AddressError('ADDRESS_PROVIDER_INVALID_RESPONSE');
    }

    const uniqueCities = new Map<string, BrazilianCity>();

    for (const item of payload) {
      if (!isRecord(item)) {
        throw new AddressError('ADDRESS_PROVIDER_INVALID_RESPONSE');
      }

      const name = requiredString(item, 'nome');

      const code = identifier(item.codigo_ibge);

      if (!code) {
        throw new AddressError('ADDRESS_PROVIDER_INVALID_RESPONSE');
      }

      const key = name
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLocaleLowerCase('pt-BR');

      if (!uniqueCities.has(key)) {
        uniqueCities.set(key, {
          code,
          name,
        });
      }
    }

    const cities = [...uniqueCities.values()].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));

    writeCache(citiesCache, state, cities, CITIES_TTL_MS);

    return cities.map((city) => ({ ...city }));
  }

  private async request(path: string): Promise<Response> {
    try {
      return await fetch(new URL(path, this.baseUrl), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'bom-trato-api',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new AddressError('ADDRESS_PROVIDER_UNAVAILABLE');
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new AddressError('ADDRESS_PROVIDER_INVALID_RESPONSE');
    }
  }
}
