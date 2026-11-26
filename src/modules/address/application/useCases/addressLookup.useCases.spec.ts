import { describe, expect, it, vi } from 'vitest';

import type { AddressProvider } from '../ports/addressProvider.port.js';
import { GetAddressByPostalCodeUseCase } from './getAddressByPostalCode.useCase.js';
import { ListBrazilianCitiesUseCase } from './listBrazilianCities.useCase.js';
import { ListBrazilianStatesUseCase } from './listBrazilianStates.useCase.js';

describe('Brazilian address use cases', () => {
  it('normalizes CEP before transport and rejects unknown addresses', async () => {
    const findByPostalCode = vi.fn<AddressProvider['findByPostalCode']>().mockResolvedValue(null);
    const useCase = new GetAddressByPostalCodeUseCase({ findByPostalCode, listCities: vi.fn() });

    await expect(useCase.execute('01001-000')).rejects.toThrow('POSTAL_CODE_NOT_FOUND');
    expect(findByPostalCode).toHaveBeenCalledWith('01001000');
    await expect(useCase.execute('123')).rejects.toThrow('INVALID_POSTAL_CODE');
    expect(findByPostalCode).toHaveBeenCalledTimes(1);
  });

  it('queries valid normalized states and exposes all 27 unique federation units', async () => {
    const listCities = vi.fn<AddressProvider['listCities']>().mockResolvedValue([{
      code: '3170206',
      name: 'Uberlandia'
    }]);
    const useCase = new ListBrazilianCitiesUseCase({ findByPostalCode: vi.fn(), listCities });

    expect(await useCase.execute(' mg ')).toEqual([{ code: '3170206', name: 'Uberlandia' }]);
    expect(listCities).toHaveBeenCalledWith('MG');
    expect(() => useCase.execute('XX')).toThrow('INVALID_STATE');
    expect(listCities).toHaveBeenCalledTimes(1);

    const states = await new ListBrazilianStatesUseCase().execute();

    expect(states).toHaveLength(27);
    expect(new Set(states.map((state) => state.code)).size).toBe(27);
    expect(states.some((state) => state.code === 'DF')).toBe(true);
  });
});
