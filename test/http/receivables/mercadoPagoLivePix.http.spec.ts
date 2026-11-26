import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManageMercadoPagoLivePixUseCase } from '../../../src/modules/receivables/application/useCases/manageMercadoPagoLivePix.useCase.js';
import { MercadoPagoLivePixController } from '../../../src/modules/receivables/presentation/http/controllers/mercadoPagoLivePix.controller.js';
import { ReceivingSettingsError } from '../../../src/modules/receivables/domain/errors/receivingSettings.error.js';
import { createHttpFixture, organizationId, itemId, userId } from '../support/http.fixture.js';

const route = '/api/organizations/' + organizationId + '/receivables/' + itemId + '/mercado-pago/live-pix';
const actor = { organizationId, receivableId: itemId, userId, sessionId: 'session' };
const input = {
  version: 2,
  buyerEmail: 'fixture@example.invalid',
  buyerDocumentType: 'CPF',
  buyerDocumentNumber: '00000000000',
  confirmed: true,
};

describe('Mercado Pago live Pix HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const read = vi.fn();
  const issue = vi.fn();
  const recover = vi.fn();

  beforeAll(async () => {
    fixture = await createHttpFixture([MercadoPagoLivePixController], [
      { provide: ManageMercadoPagoLivePixUseCase, useValue: { read, issue, recover } },
    ]);
  });

  beforeEach(() => {
    read.mockReset().mockResolvedValue({ issuanceId: null, canIssue: true });
    issue.mockReset().mockResolvedValue({ issuanceId: itemId, canIssue: false });
    recover.mockReset().mockResolvedValue({ issuanceId: itemId, canIssue: false });
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('requires authentication, explicit consent and valid input before issuing a charge', async () => {
    await request(fixture.server).post(route).send(input).expect(401);

    for (const body of [
      { ...input, confirmed: false },
      { ...input, confirmed: 'true' },
      { ...input, version: 0 },
      { ...input, buyerEmail: 'invalid' },
      { ...input, buyerDocumentType: 'INVALID' },
      { ...input, buyerDocumentNumber: '123' },
      { ...input, userId: itemId },
    ]) {
      await request(fixture.server).post(route).set('Authorization', 'Bearer fixture').send(body).expect(400);
    }

    expect(issue).not.toHaveBeenCalled();

    const response = await request(fixture.server).post(route).set('Authorization', 'Bearer fixture').send(input).expect(200);

    expect(issue).toHaveBeenCalledWith(actor, expect.objectContaining(input));
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('scopes status to the authenticated session and maps owner and financial conflicts', async () => {
    const response = await request(fixture.server).get(route).set('Authorization', 'Bearer fixture').expect(200);

    expect(read).toHaveBeenCalledWith(actor);
    expect(response.headers['cache-control']).toContain('no-store');

    read.mockRejectedValueOnce(new ReceivingSettingsError('OWNER_REQUIRED'));
    issue.mockRejectedValueOnce(new ReceivingSettingsError('MERCADO_PAGO_PIX_CONFLICT'));

    await request(fixture.server).get(route).set('Authorization', 'Bearer fixture').expect(403);
    await request(fixture.server).post(route).set('Authorization', 'Bearer fixture').send(input).expect(409);
  });

  it('recovers only a valid issuance under the trusted actor and maps provider unavailability', async () => {
    await request(fixture.server).post(route + '/recovery').set('Authorization', 'Bearer fixture')
      .send({ issuanceId: 'invalid' }).expect(400);
    expect(recover).not.toHaveBeenCalled();

    await request(fixture.server).post(route + '/recovery').set('Authorization', 'Bearer fixture')
      .send({ issuanceId: itemId }).expect(200);
    expect(recover).toHaveBeenCalledWith(actor, expect.objectContaining({ issuanceId: itemId }));

    recover.mockRejectedValueOnce(new ReceivingSettingsError('MERCADO_PAGO_UNAVAILABLE'));
    await request(fixture.server).post(route + '/recovery').set('Authorization', 'Bearer fixture')
      .send({ issuanceId: itemId }).expect(503);
  });
});
