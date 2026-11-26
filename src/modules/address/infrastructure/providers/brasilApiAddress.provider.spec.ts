import { describe, expect, it, vi } from 'vitest';

import { BrasilApiAddressProvider } from './brasilApiAddress.provider.js';

const provider = new BrasilApiAddressProvider();
const payload = {
  cep: '38400-000',
  street: ' Rua de teste ',
  neighborhood: '',
  city: ' Uberlandia ',
  state: 'mg',
  ibge: { city: 3170206, state: 31 },
};

describe('BrasilApiAddressProvider', () => {
  it('normalizes a successful CEP response, caches a detached result and refetches at TTL', async () => {
    const clock = vi.spyOn(Date, 'now');
    let now = Date.now();
    clock.mockImplementation(() => now);
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(payload));
    try {
      const result = await provider.findByPostalCode('38400000');
      expect(result).toEqual({
        postalCode: '38400000',
        street: 'Rua de teste',
        neighborhood: null,
        city: 'Uberlandia',
        state: 'MG',
        cityIbgeCode: '3170206',
        stateIbgeCode: '31',
      });
      if (!result) {
        throw new Error('Missing fixture');
      }
      result.city = 'Changed';
      expect((await provider.findByPostalCode('38400000'))?.city).toBe('Uberlandia');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(String(fetch.mock.calls[0]![0])).toBe('https://brasilapi.com.br/api/cep/v1/38400000');
      now += 7 * 86400000;
      await provider.findByPostalCode('38400000');
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      fetch.mockRestore();
      clock.mockRestore();
    }
  });

  it('distinguishes missing CEP, unavailable transport and malformed provider data', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    try {
      fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
      expect(await provider.findByPostalCode('01001001')).toBeNull();
      fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
      await expect(provider.findByPostalCode('01001001')).rejects.toThrow('ADDRESS_PROVIDER_UNAVAILABLE');
      fetch.mockRejectedValueOnce(new Error('timeout'));
      await expect(provider.findByPostalCode('01001001')).rejects.toThrow('ADDRESS_PROVIDER_UNAVAILABLE');
      fetch.mockResolvedValueOnce(Response.json({ ...payload, cep: 'invalid' }));
      await expect(provider.findByPostalCode('01001001')).rejects.toThrow('ADDRESS_PROVIDER_INVALID_RESPONSE');
      fetch.mockResolvedValueOnce(new Response('not-json', { status: 200 }));
      await expect(provider.findByPostalCode('01001001')).rejects.toThrow('ADDRESS_PROVIDER_INVALID_RESPONSE');
      expect(fetch).toHaveBeenCalledTimes(5);
    } finally {
      fetch.mockRestore();
    }
  });

  it('deduplicates municipality names accent-insensitively and keeps state caches independent', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json([
        { nome: 'Zeta', codigo_ibge: 3 },
        { nome: 'Águas', codigo_ibge: '1' },
        { nome: 'Aguas', codigo_ibge: 2 },
      ]),
    );
    try {
      expect(await provider.listCities('MG')).toEqual([
        { name: 'Águas', code: '1' },
        { name: 'Zeta', code: '3' },
      ]);
      const cached = await provider.listCities('MG');
      cached[0]!.name = 'Changed';
      expect((await provider.listCities('MG'))[0]!.name).toBe('Águas');
      await provider.listCities('SP');
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      fetch.mockRestore();
    }
  });
});
