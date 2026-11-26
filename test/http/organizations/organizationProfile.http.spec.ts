import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { BillingError } from '../../../src/modules/billing/domain/errors/billing.error.js';
import { CreateOrganizationUseCase } from '../../../src/modules/organizations/application/useCases/createOrganization.useCase.js';
import { GetOrganizationProfileUseCase } from '../../../src/modules/organizations/application/useCases/getOrganizationProfile.useCase.js';
import { ListOwnedOrganizationsUseCase } from '../../../src/modules/organizations/application/useCases/listOwnedOrganizations.useCase.js';
import { RemoveOrganizationLogoUseCase } from '../../../src/modules/organizations/application/useCases/removeOrganizationLogo.useCase.js';
import { UpdateOrganizationProfileUseCase } from '../../../src/modules/organizations/application/useCases/updateOrganizationProfile.useCase.js';
import { UploadOrganizationLogoUseCase } from '../../../src/modules/organizations/application/useCases/uploadOrganizationLogo.useCase.js';
import { OrganizationError } from '../../../src/modules/organizations/domain/errors/organization.error.js';
import { OrganizationTeamError } from '../../../src/modules/organizations/domain/errors/organizationTeam.error.js';
import { OrganizationProfileController } from '../../../src/modules/organizations/presentation/http/controllers/organizationProfile.controller.js';
import { OrganizationsController } from '../../../src/modules/organizations/presentation/http/controllers/organizations.controller.js';
import { readJsonObject } from '../../support/testJson.js';
import { createHttpFixture, itemId, organizationId, userId } from '../support/http.fixture.js';

const route = '/api/organizations';
const profileRoute = route + '/' + organizationId + '/profile';
const actor = { organizationId, userId };
const profile = { id: organizationId, name: 'Fixture company', logoUrl: null };

describe('organization creation and profile HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const create = vi.fn();
  const list = vi.fn();
  const get = vi.fn();
  const update = vi.fn();
  const upload = vi.fn();
  const remove = vi.fn();

  beforeAll(async () => {
    fixture = await createHttpFixture(
      [OrganizationsController, OrganizationProfileController],
      [
        { provide: CreateOrganizationUseCase, useValue: { execute: create } },
        { provide: ListOwnedOrganizationsUseCase, useValue: { execute: list } },
        { provide: GetOrganizationProfileUseCase, useValue: { execute: get } },
        { provide: UpdateOrganizationProfileUseCase, useValue: { execute: update } },
        { provide: UploadOrganizationLogoUseCase, useValue: { execute: upload } },
        { provide: RemoveOrganizationLogoUseCase, useValue: { execute: remove } },
      ],
    );
  });

  beforeEach(() => {
    for (const operation of [create, get, update, upload, remove]) {
      operation.mockReset().mockResolvedValue(profile);
    }
    list.mockReset().mockResolvedValue([profile]);
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('requires authentication before organization creation and listing', async () => {
    await request(fixture.server)
      .post(route)
      .set('Idempotency-Key', itemId)
      .send({ name: 'Fixture company' })
      .expect(401);
    await request(fixture.server).get(route).expect(401);
    expect(create).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it.each(['', 'invalid', '11111111-1111-1111-8111-111111111111'])('rejects invalid idempotency keys', async (key) => {
    const req = request(fixture.server).post(route).set('Authorization', 'Bearer fixture');
    if (key) {
      req.set('Idempotency-Key', key);
    }
    await req.send({ name: 'Fixture company' }).expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([{ name: ' ' }, { name: 123 }, { name: 'a'.repeat(101) }, { name: 'Fixture company', ownerId: itemId }])(
    'rejects invalid organization creation details',
    async (body) => {
      await request(fixture.server)
        .post(route)
        .set('Authorization', 'Bearer fixture')
        .set('Idempotency-Key', itemId)
        .send(body)
        .expect(400);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('uses the authenticated owner and normalized name for idempotent creation', async () => {
    await request(fixture.server)
      .post(route)
      .set('Authorization', 'Bearer fixture')
      .set('Idempotency-Key', itemId)
      .send({ name: '  Fixture company  ' })
      .expect(201);
    expect(create).toHaveBeenCalledWith({
      creationKey: itemId,
      userId,
      email: 'owner@example.invalid',
      name: 'Fixture company',
    });
  });

  it('maps an idempotency conflict without creating a second organization', async () => {
    create.mockRejectedValueOnce(new OrganizationError('IDEMPOTENCY_CONFLICT'));
    const response = await request(fixture.server)
      .post(route)
      .set('Authorization', 'Bearer fixture')
      .set('Idempotency-Key', itemId)
      .send({ name: 'Another company' })
      .expect(409);
    expect(readJsonObject(readJsonObject(response.body).error).code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('lists organizations for the authenticated owner only', async () => {
    await request(fixture.server).get(route).set('Authorization', 'Bearer fixture').expect(200);
    expect(list).toHaveBeenCalledExactlyOnceWith(userId);
  });

  it('scopes profile reads to the route organization and authenticated user', async () => {
    await request(fixture.server).get(profileRoute).expect(401);
    await request(fixture.server)
      .get(route + '/invalid/profile')
      .set('Authorization', 'Bearer fixture')
      .expect(400);
    expect(get).not.toHaveBeenCalled();
    const response = await request(fixture.server).get(profileRoute).set('Authorization', 'Bearer fixture').expect(200);
    expect(readJsonObject(response.body).data).toEqual(profile);
    expect(get).toHaveBeenCalledWith(actor);
  });

  it('normalizes profile fields and preserves explicit false and zero values', async () => {
    await request(fixture.server)
      .patch(profileRoute)
      .set('Authorization', 'Bearer fixture')
      .send({
        name: '  New company  ',
        email: '  owner@example.com  ',
        phone: ' (34) 99999-9999 ',
        documentType: 'CPF',
        document: '191.191.191-00',
        postalCode: '38400-000',
        addressLine1: '  Street  ',
        addressLine2: ' ',
        city: ' Uberlandia ',
        state: ' mg ',
        defaultReceivableDueDays: 0,
        autoQuoteFollowUpEnabled: false,
        autoWorkOrderReminderEnabled: true,
        autoReviewRequestEnabled: false,
        autoReceivableReminderEnabled: true,
      })
      .expect(200);
    expect(update).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        name: 'New company',
        email: 'owner@example.com',
        phone: '(34) 99999-9999',
        documentType: 'CPF',
        document: '19119119100',
        postalCode: '38400000',
        addressLine1: 'Street',
        addressLine2: null,
        city: 'Uberlandia',
        state: 'MG',
        defaultReceivableDueDays: 0,
        autoQuoteFollowUpEnabled: false,
        autoWorkOrderReminderEnabled: true,
        autoReviewRequestEnabled: false,
        autoReceivableReminderEnabled: true,
      }),
    );
  });

  it('allows nullable profile fields to be explicitly cleared', async () => {
    await request(fixture.server)
      .patch(profileRoute)
      .set('Authorization', 'Bearer fixture')
      .send({ email: ' ', phone: '', documentType: '', document: '', postalCode: '', state: '' })
      .expect(200);
    expect(update).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        email: null,
        phone: null,
        documentType: null,
        document: null,
        postalCode: null,
        state: null,
      }),
    );
  });

  it.each([
    { name: 42 },
    { name: 'x' },
    { email: 'invalid' },
    { email: 42 },
    { phone: 'invalid' },
    { documentType: 'OTHER' },
    { document: '123' },
    { document: 123 },
    { postalCode: '123' },
    { state: 'MINAS' },
    { state: 12 },
    { addressLine1: 'x'.repeat(151) },
    { addressLine2: 'x'.repeat(101) },
    { city: 'x'.repeat(101) },
    { defaultReceivableDueDays: -1 },
    { defaultReceivableDueDays: 366 },
    { defaultReceivableDueDays: 1.5 },
    { autoQuoteFollowUpEnabled: 'false' },
    { autoWorkOrderReminderEnabled: 1 },
    { autoReviewRequestEnabled: 'true' },
    { autoReceivableReminderEnabled: 0 },
    { ownerId: itemId },
    { logoKey: 'private-key' },
  ])('rejects invalid or unauthorized profile fields: %j', async (body) => {
    await request(fixture.server).patch(profileRoute).set('Authorization', 'Bearer fixture').send(body).expect(400);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    [new OrganizationError('EMPTY_ORGANIZATION_UPDATE'), 400],
    [new OrganizationTeamError('OWNER_REQUIRED'), 403],
    [new BillingError('BILLING_RECONCILIATION_REQUIRED'), 503],
  ] as const)('preserves error contracts across profile and billing boundaries', async (error, status) => {
    update.mockRejectedValueOnce(error);
    const response = await request(fixture.server)
      .patch(profileRoute)
      .set('Authorization', 'Bearer fixture')
      .send({ name: 'New company' })
      .expect(status);
    expect(readJsonObject(readJsonObject(response.body).error).code).toBe(error.code);
  });

  it('forwards uploaded multipart bytes, size and MIME type', async () => {
    const buffer = Buffer.from('fixture logo');
    await request(fixture.server)
      .post(profileRoute + '/logo')
      .set('Authorization', 'Bearer fixture')
      .attach('logo', buffer, { filename: 'logo.png', contentType: 'image/png' })
      .expect(200);
    expect(upload).toHaveBeenCalledWith(actor, { buffer, mimeType: 'image/png', size: buffer.length });
  });

  it('delegates missing-file validation to the domain and maps the error', async () => {
    upload.mockRejectedValueOnce(new OrganizationError('ORGANIZATION_LOGO_REQUIRED'));
    const response = await request(fixture.server)
      .post(profileRoute + '/logo')
      .set('Authorization', 'Bearer fixture')
      .expect(400);
    expect(upload).toHaveBeenCalledWith(actor, { buffer: Buffer.alloc(0), mimeType: '', size: 0 });
    expect(readJsonObject(readJsonObject(response.body).error).code).toBe('ORGANIZATION_LOGO_REQUIRED');
  });

  it('rejects oversized multipart files before invoking storage operations', async () => {
    await request(fixture.server)
      .post(profileRoute + '/logo')
      .set('Authorization', 'Bearer fixture')
      .attach('logo', Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'logo.png', contentType: 'image/png' })
      .expect(413);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects unexpected multipart file fields', async () => {
    await request(fixture.server)
      .post(profileRoute + '/logo')
      .set('Authorization', 'Bearer fixture')
      .attach('other', Buffer.from('fixture'), 'logo.png')
      .expect(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it('requires authentication for logo removal and uses the scoped actor', async () => {
    await request(fixture.server)
      .delete(profileRoute + '/logo')
      .expect(401);
    expect(remove).not.toHaveBeenCalled();
    await request(fixture.server)
      .delete(profileRoute + '/logo')
      .set('Authorization', 'Bearer fixture')
      .expect(200);
    expect(remove).toHaveBeenCalledExactlyOnceWith(actor);
  });
});
