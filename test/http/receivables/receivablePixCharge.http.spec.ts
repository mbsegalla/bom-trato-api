import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GetReceivablePixChargeUseCase } from '../../../src/modules/receivables/application/useCases/getReceivablePixCharge.useCase.js';
import { ReceivingSettingsError } from '../../../src/modules/receivables/domain/errors/receivingSettings.error.js';
import { ReceivablePixChargeController } from '../../../src/modules/receivables/presentation/http/controllers/receivablePixCharge.controller.js';
import { readJsonObject } from '../../support/testJson.js';
import { createHttpFixture, itemId, organizationId, userId } from '../support/http.fixture.js';

const route = '/api/organizations/' + organizationId + '/receivables/' + itemId + '/pix-charge';

describe('static Pix charge HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const execute = vi.fn();

  beforeAll(async () => {
    fixture = await createHttpFixture(
      [ReceivablePixChargeController],
      [{ provide: GetReceivablePixChargeUseCase, useValue: { execute } }],
    );
  });

  beforeEach(() => {
    execute.mockReset().mockResolvedValue({ amountInCents: 1000, copyAndPaste: 'fixture' });
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('requires authentication and valid route identities before reading private payment data', async () => {
    await request(fixture.server).get(route).expect(401);
    await request(fixture.server)
      .get(route.replace(itemId, 'invalid'))
      .set('Authorization', 'Bearer fixture')
      .expect(400);

    expect(execute).not.toHaveBeenCalled();

    const response = await request(fixture.server).get(route).set('Authorization', 'Bearer fixture').expect(200);

    expect(response.headers['cache-control']).toContain('no-store');
    expect(execute).toHaveBeenCalledWith({ organizationId, receivableId: itemId, userId });
  });

  it.each([
    ['OWNER_REQUIRED', 403],
    ['RECEIVABLE_NOT_FOUND', 404],
    ['PIX_DESTINATION_NOT_CONFIGURED', 409],
    ['PIX_CHARGE_NOT_AVAILABLE', 409],
    ['RECEIVING_SETTINGS_UNAVAILABLE', 503],
  ] as const)('maps %s to HTTP %i without exposing payment data', async (code, status) => {
    execute.mockRejectedValueOnce(new ReceivingSettingsError(code));

    const response = await request(fixture.server).get(route).set('Authorization', 'Bearer fixture').expect(status);

    expect(readJsonObject(response.body).data).toBeUndefined();
  });
});
