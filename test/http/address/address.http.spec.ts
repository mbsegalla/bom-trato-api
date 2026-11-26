import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GetAddressByPostalCodeUseCase } from '../../../src/modules/address/application/useCases/getAddressByPostalCode.useCase.js';
import { ListBrazilianCitiesUseCase } from '../../../src/modules/address/application/useCases/listBrazilianCities.useCase.js';
import { ListBrazilianStatesUseCase } from '../../../src/modules/address/application/useCases/listBrazilianStates.useCase.js';
import { AddressController } from '../../../src/modules/address/presentation/http/controllers/address.controller.js';
import { AddressError } from '../../../src/modules/address/domain/errors/address.error.js';
import { createHttpFixture } from '../support/http.fixture.js';

describe('address HTTP routes', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const findByPostalCode = vi.fn<GetAddressByPostalCodeUseCase['execute']>();
  const cities = vi.fn<ListBrazilianCitiesUseCase['execute']>();
  beforeAll(async () => {
    fixture = await createHttpFixture([AddressController], [
      { provide: GetAddressByPostalCodeUseCase, useValue: { execute: findByPostalCode } },
      { provide: ListBrazilianCitiesUseCase, useValue: { execute: cities } },
      { provide: ListBrazilianStatesUseCase, useValue: new ListBrazilianStatesUseCase() },
    ]);
  });
  beforeEach(() => { findByPostalCode.mockReset(); cities.mockReset(); });
  afterAll(async () => { await fixture?.app.close(); });

  it('requires authentication and returns a wrapped state list', async () => {
    await request(fixture.server).get('/api/address/states').expect(401);
    const response = await request(fixture.server).get('/api/address/states').set('Authorization', 'Bearer fixture').expect(200);
    expect(response.body.data).toHaveLength(27);
    expect(response.body.success).toBe(true);
  });

  it('maps missing postal codes and upstream failures to the correct HTTP status', async () => {
    for (const [code, status] of [['INVALID_POSTAL_CODE', 400], ['POSTAL_CODE_NOT_FOUND', 404], ['ADDRESS_PROVIDER_UNAVAILABLE', 503], ['ADDRESS_PROVIDER_INVALID_RESPONSE', 502]] as const) {
      findByPostalCode.mockRejectedValueOnce(new AddressError(code));
      const response = await request(fixture.server).get('/api/address/postal-codes/01001000').set('Authorization', 'Bearer fixture').expect(status);
      expect(response.body.error.code).toBe(code);
    }
  });
});
