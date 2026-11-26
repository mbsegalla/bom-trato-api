import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { appConfig } from '../../../src/config/app.config.js';
import { ManageReceivablePaymentLinkUseCase } from '../../../src/modules/receivables/application/useCases/manageReceivablePaymentLink.useCase.js';
import { ReceivingSettingsError } from '../../../src/modules/receivables/domain/errors/receivingSettings.error.js';
import { ReceivablePaymentLinksController } from '../../../src/modules/receivables/presentation/http/controllers/receivablePaymentLinks.controller.js';
import { createHttpFixture, itemId, organizationId, userId } from '../support/http.fixture.js';

const route = '/api/organizations/' + organizationId + '/receivables/' + itemId + '/payment-link';
const actor = { organizationId, userId };
const token = 'b'.repeat(64);
describe('receivablePaymentLinks HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const create = vi.fn();
  const status = vi.fn();
  const revoke = vi.fn();

  beforeAll(async () => {
    fixture = await createHttpFixture(
      [ReceivablePaymentLinksController],
      [
        { provide: ManageReceivablePaymentLinkUseCase, useValue: { create, status, revoke } },
        { provide: appConfig.KEY, useValue: { frontendUrl: 'https://app.example.invalid' } },
      ],
    );
  });

  beforeEach(() => {
    create.mockReset().mockResolvedValue({ token, expiresAt: new Date('2030-01-01T00:00:00Z') });
    status.mockReset().mockResolvedValue(null);
    revoke.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('validates link creation versions and rejects unauthenticated or spoofed requests', async () => {
    await request(fixture.server).post(route).send({ version: 2 }).expect(401);

    for (const body of [{ version: 0 }, { version: 1.5 }, { version: 2, userId: itemId }]) {
      await request(fixture.server).post(route).set('Authorization', 'Bearer fixture').send(body).expect(400);
    }

    expect(create).not.toHaveBeenCalled();
  });

  it('returns a no-store payment link with its token in the fragment and passes only trusted scope', async () => {
    const response = await request(fixture.server)
      .post(route)
      .set('Authorization', 'Bearer fixture')
      .send({ version: 2 })
      .expect(201);
    const url = new URL(response.body.data.url);

    expect(url.pathname).toBe('/pagar');
    expect(url.origin).toBe('https://app.example.invalid');
    expect(url.search).toBe('');
    expect(url.hash).toBe('#token=' + token);
    expect(response.body.data).not.toHaveProperty('token');
    expect(response.headers['cache-control']).toContain('no-store');
    expect(create).toHaveBeenCalledWith({ ...actor, receivableId: itemId }, 2);
  });

  it('reads and revokes the scoped link, and distinguishes permission and stale version failures', async () => {
    await request(fixture.server).get(route).set('Authorization', 'Bearer fixture').expect(200);
    await request(fixture.server).delete(route).set('Authorization', 'Bearer fixture').expect(204);

    expect(status).toHaveBeenCalledWith({ ...actor, receivableId: itemId });
    expect(revoke).toHaveBeenCalledWith({ ...actor, receivableId: itemId });

    status.mockRejectedValueOnce(new ReceivingSettingsError('OWNER_REQUIRED'));
    create.mockRejectedValueOnce(new ReceivingSettingsError('PAYMENT_LINK_VERSION_CONFLICT'));

    await request(fixture.server).get(route).set('Authorization', 'Bearer fixture').expect(403);
    await request(fixture.server).post(route).set('Authorization', 'Bearer fixture').send({ version: 2 }).expect(409);
  });
});
