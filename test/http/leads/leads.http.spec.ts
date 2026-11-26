import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ListLeadsUseCase } from '../../../src/modules/leads/application/useCases/listLeads.useCase.js';
import { GetLeadUseCase } from '../../../src/modules/leads/application/useCases/getLead.useCase.js';
import { MarkLeadContactedUseCase } from '../../../src/modules/leads/application/useCases/markLeadContacted.useCase.js';
import { ConvertLeadUseCase } from '../../../src/modules/leads/application/useCases/convertLead.useCase.js';
import { ArchiveLeadUseCase } from '../../../src/modules/leads/application/useCases/archiveLead.useCase.js';
import { CreatePublicLeadUseCase } from '../../../src/modules/leads/application/useCases/createPublicLead.useCase.js';
import { LeadsController } from '../../../src/modules/leads/presentation/http/controllers/leads.controller.js';
import { PublicLeadsController } from '../../../src/modules/leads/presentation/http/controllers/publicLeads.controller.js';
import { LeadError } from '../../../src/modules/leads/domain/errors/lead.error.js';
import { createHttpFixture, organizationId, itemId, userId } from '../support/http.fixture.js';

describe('leads HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const list = vi.fn();
  const get = vi.fn();
  const contacted = vi.fn();
  const convert = vi.fn();
  const archive = vi.fn();
  const create = vi.fn();
  const auth = 'Bearer fixture';
  const actor = { organizationId, userId };

  beforeAll(async () => {
    fixture = await createHttpFixture([LeadsController, PublicLeadsController], [
      { provide: ListLeadsUseCase, useValue: { execute: list } },
      { provide: GetLeadUseCase, useValue: { execute: get } },
      { provide: MarkLeadContactedUseCase, useValue: { execute: contacted } },
      { provide: ConvertLeadUseCase, useValue: { execute: convert } },
      { provide: ArchiveLeadUseCase, useValue: { execute: archive } },
      { provide: CreatePublicLeadUseCase, useValue: { execute: create } },
    ]);
  });

  beforeEach(() => {
    for (const mock of [list, get, contacted, convert, archive, create]) {
      mock.mockReset().mockResolvedValue({});
    }
  });

  afterAll(async () => {
    await fixture?.app.close();
  });


  const route = '/api/organizations/' + organizationId + '/leads';
  const publicRoute = '/api/public/professionals/Fixture-Professional/leads';
  const lead = { requestKey: itemId, name: 'Fixture customer', email: 'customer@example.invalid', message: 'Fixture request for service' };

  it('requires authentication for private reads and actions and scopes identity to the authenticated user', async () => {
    await request(fixture.server).get(route).expect(401);
    await request(fixture.server).post(route + '/' + itemId + '/convert').expect(401);
    expect(list).not.toHaveBeenCalled();
    expect(convert).not.toHaveBeenCalled();

    await request(fixture.server).get(route).set('Authorization', auth)
      .query({ page: 2, limit: 5, search: '  Fixture  ' }).expect(200);

    expect(list).toHaveBeenCalledWith(actor, expect.objectContaining({ page: 2, limit: 5, search: 'Fixture' }));
  });

  it('rejects malformed identifiers and invalid filters before invoking private use cases', async () => {
    await request(fixture.server).get(route + '/invalid').set('Authorization', auth).expect(400);
    await request(fixture.server).get(route).set('Authorization', auth).query({ page: 0 }).expect(400);
    await request(fixture.server).get(route).set('Authorization', auth).query({ status: 'UNKNOWN' }).expect(400);

    expect(get).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('dispatches each lead action with the route identity and trusted session actor', async () => {
    const path = route + '/' + itemId;

    await request(fixture.server).get(path).set('Authorization', auth).expect(200);
    await request(fixture.server).post(path + '/contacted').set('Authorization', auth).expect(200);
    await request(fixture.server).post(path + '/convert').set('Authorization', auth).expect(200);
    await request(fixture.server).post(path + '/archive').set('Authorization', auth).expect(200);

    for (const mock of [get, contacted, convert, archive]) {
      expect(mock).toHaveBeenCalledExactlyOnceWith({ ...actor, leadId: itemId });
    }
  });

  it('accepts a public lead without authentication and trims the permitted customer fields', async () => {
    await request(fixture.server).post(publicRoute).send({
      ...lead, name: '  Fixture customer  ', message: '  Fixture request for service  ', phone: ' ',
    }).expect(201);

    expect(create).toHaveBeenCalledWith('fixture-professional', expect.objectContaining({ ...lead, phone: null }));
  });

  it.each([
    { requestKey: 'invalid' },
    { name: ' ' },
    { message: 'short' },
    { email: 'invalid' },
    { catalogServiceId: 'invalid' },
    { organizationId },
  ])('rejects malformed or injected public lead input: %j', async (override) => {
    await request(fixture.server).post(publicRoute).send({ ...lead, ...override }).expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ['PUBLIC_PROFILE_NOT_FOUND', 404],
    ['PUBLIC_SERVICE_NOT_FOUND', 404],
    ['LEAD_CONTACT_REQUIRED', 400],
    ['LEAD_REQUEST_CONFLICT', 409],
    ['LEADS_BUSY', 503],
  ] as const)('maps public lead errors without leaking internal data: %s', async (code, status) => {
    create.mockRejectedValueOnce(new LeadError(code));

    const response = await request(fixture.server).post(publicRoute).send(lead).expect(status);

    expect(response.body).toMatchObject({ success: false, error: { code } });
  });

  it.each([
    ['MEMBER_REQUIRED', 403],
    ['LEAD_NOT_FOUND', 404],
    ['LEAD_CUSTOMER_ARCHIVED', 409],
    ['BILLING_RECONCILIATION_REQUIRED', 503],
  ] as const)('maps conversion denial: %s', async (code, status) => {
    convert.mockRejectedValueOnce(new LeadError(code));

    const response = await request(fixture.server).post(route + '/' + itemId + '/convert').set('Authorization', auth).expect(status);

    expect(response.body.error.code).toBe(code);
  });
});
