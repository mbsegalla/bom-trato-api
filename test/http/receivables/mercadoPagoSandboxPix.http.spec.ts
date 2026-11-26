import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManageMercadoPagoSandboxPixUseCase } from '../../../src/modules/receivables/application/useCases/manageMercadoPagoSandboxPix.useCase.js';
import { ReceivingSettingsError } from '../../../src/modules/receivables/domain/errors/receivingSettings.error.js';
import { MercadoPagoSandboxPixController } from '../../../src/modules/receivables/presentation/http/controllers/mercadoPagoSandboxPix.controller.js';
import { createHttpFixture, itemId, organizationId, userId } from '../support/http.fixture.js';

const route = '/api/organizations/' + organizationId + '/receivables/' + itemId + '/mercado-pago/sandbox-pix';
const actor = { organizationId, receivableId: itemId, userId, sessionId: 'session' };
const input = {
  version: 2,
  testBuyerEmail: 'fixture@example.invalid',
  testDocumentType: 'CPF',
  testDocumentNumber: '00000000000',
  confirmed: true,
};

describe('Mercado Pago sandbox Pix HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const read = vi.fn();
  const issue = vi.fn();

  beforeAll(async () => {
    fixture = await createHttpFixture(
      [MercadoPagoSandboxPixController],
      [{ provide: ManageMercadoPagoSandboxPixUseCase, useValue: { read, issue } }],
    );
  });

  beforeEach(() => {
    read.mockReset().mockResolvedValue({ issuanceId: null, canIssue: true });
    issue.mockReset().mockResolvedValue({ issuanceId: itemId, canIssue: false });
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
      { ...input, testBuyerEmail: 'invalid' },
      { ...input, testDocumentType: 'INVALID' },
      { ...input, testDocumentNumber: '123' },
      { ...input, userId: itemId },
    ]) {
      await request(fixture.server).post(route).set('Authorization', 'Bearer fixture').send(body).expect(400);
    }

    expect(issue).not.toHaveBeenCalled();

    const response = await request(fixture.server)
      .post(route)
      .set('Authorization', 'Bearer fixture')
      .send(input)
      .expect(200);

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
});
