import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GetPublicProfileSettingsUseCase } from '../../../src/modules/publicProfiles/application/useCases/getPublicProfileSettings.useCase.js';
import { UpdatePublicProfileUseCase } from '../../../src/modules/publicProfiles/application/useCases/updatePublicProfile.useCase.js';
import { ListPublicProfessionalsUseCase } from '../../../src/modules/publicProfiles/application/useCases/listPublicProfessionals.useCase.js';
import { GetPublicProfessionalUseCase } from '../../../src/modules/publicProfiles/application/useCases/getPublicProfessional.useCase.js';
import { GetPublicProfessionalWhatsappUseCase } from '../../../src/modules/publicProfiles/application/useCases/getPublicProfessionalWhatsapp.useCase.js';
import { OrganizationPublicProfileController } from '../../../src/modules/publicProfiles/presentation/http/controllers/organizationPublicProfile.controller.js';
import { PublicProfessionalsController } from '../../../src/modules/publicProfiles/presentation/http/controllers/publicProfessionals.controller.js';
import { PublicProfileError } from '../../../src/modules/publicProfiles/domain/errors/publicProfile.error.js';
import { OrganizationTeamError } from '../../../src/modules/organizations/domain/errors/organizationTeam.error.js';
import { createHttpFixture, organizationId, itemId, userId } from '../support/http.fixture.js';

describe('publicProfiles HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const getSettings = vi.fn();
  const update = vi.fn();
  const list = vi.fn();
  const get = vi.fn();
  const whatsapp = vi.fn();
  const auth = 'Bearer fixture';
  const actor = { organizationId, userId };

  beforeAll(async () => {
    fixture = await createHttpFixture([OrganizationPublicProfileController, PublicProfessionalsController], [
      { provide: GetPublicProfileSettingsUseCase, useValue: { execute: getSettings } },
      { provide: UpdatePublicProfileUseCase, useValue: { execute: update } },
      { provide: ListPublicProfessionalsUseCase, useValue: { execute: list } },
      { provide: GetPublicProfessionalUseCase, useValue: { execute: get } },
      { provide: GetPublicProfessionalWhatsappUseCase, useValue: { execute: whatsapp } },
    ]);
  });

  beforeEach(() => {
    for (const mock of [getSettings, update, list, get, whatsapp]) {
      mock.mockReset().mockResolvedValue({});
    }
  });

  afterAll(async () => {
    await fixture?.app.close();
  });


  const route = '/api/organizations/' + organizationId + '/public-profile';
  const publicRoute = '/api/public/professionals';
  const input = {
    slug: 'fixture-professional',
    headline: null,
    description: null,
    whatsappPhone: '34999991234',
    whatsappEnabled: true,
    published: true,
    serviceIds: [itemId],
  };

  it('scopes profile settings to the authenticated actor and normalizes editable public fields', async () => {
    await request(fixture.server).get(route).expect(401);
    await request(fixture.server).get(route).set('Authorization', auth).expect(200);
    await request(fixture.server).patch(route).set('Authorization', auth).send({
      ...input, slug: '  Fixture-Professional  ', headline: '  Fixture headline  ', description: ' ',
    }).expect(200);

    expect(getSettings).toHaveBeenCalledExactlyOnceWith(actor);
    expect(update).toHaveBeenCalledExactlyOnceWith(actor, expect.objectContaining({
      ...input, headline: 'Fixture headline', description: null,
    }));
  });

  it.each([
    { slug: 'bad slug!' },
    { serviceIds: [itemId, itemId] },
    { serviceIds: ['invalid'] },
    { published: 'true' },
    { ownerId: userId },
    { ratingCount: 100 },
  ])('rejects invalid public configuration or injected reputation fields: %j', async (override) => {
    await request(fixture.server).patch(route).set('Authorization', auth).send({ ...input, ...override }).expect(400);

    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['PUBLIC_PROFILE_SLUG_TAKEN', 409],
    ['PUBLIC_PROFILE_LOCATION_REQUIRED', 409],
    ['PUBLIC_PROFILE_CONTACT_REQUIRED', 400],
    ['PUBLIC_PROFILE_SERVICE_NOT_FOUND', 400],
  ] as const)('maps settings validation: %s', async (code, status) => {
    update.mockRejectedValueOnce(new PublicProfileError(code));

    const response = await request(fixture.server).patch(route).set('Authorization', auth).send(input).expect(status);

    expect(response.body.error.code).toBe(code);
  });

  it('preserves organization permission errors through the composed HTTP error boundary', async () => {
    update.mockRejectedValueOnce(new OrganizationTeamError('OWNER_REQUIRED'));

    const response = await request(fixture.server).patch(route).set('Authorization', auth).send(input).expect(403);

    expect(response.body.error.code).toBe('OWNER_REQUIRED');
  });

  it('allows anonymous directory reads, normalizes filters and rejects invalid pagination', async () => {
    await request(fixture.server).get(publicRoute).query({ search: '  Fixture  ', city: '  Uberlândia  ', state: ' mg ', page: 2 }).expect(200);

    expect(list).toHaveBeenCalledWith(expect.objectContaining({
      search: 'Fixture', city: 'Uberlândia', state: 'MG', page: 2, limit: 12,
    }));

    await request(fixture.server).get(publicRoute).query({ state: 'INVALID' }).expect(400);
    await request(fixture.server).get(publicRoute).query({ limit: 101 }).expect(400);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('returns a redirect only for an available public WhatsApp contact', async () => {
    const url = 'https://wa.me/5534999991234';
    whatsapp.mockResolvedValueOnce(url);

    await request(fixture.server).get(publicRoute + '/fixture-professional/whatsapp').expect(302).expect('Location', url);
    expect(whatsapp).toHaveBeenCalledWith('fixture-professional');

    whatsapp.mockRejectedValueOnce(new PublicProfileError('PUBLIC_PROFILE_CONTACT_UNAVAILABLE'));
    const response = await request(fixture.server).get(publicRoute + '/fixture-professional/whatsapp').expect(404);

    expect(response.headers.location).toBeUndefined();
    expect(response.body.error.code).toBe('PUBLIC_PROFILE_CONTACT_UNAVAILABLE');

    await request(fixture.server).get(publicRoute + '/fixture-professional').expect(200);
    expect(get).toHaveBeenCalledWith('fixture-professional');
  });
});
