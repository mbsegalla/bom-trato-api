import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManageReceivingSettingsUseCase } from '../../../src/modules/receivables/application/useCases/manageReceivingSettings.useCase.js';
import { ReceivingSettingsError } from '../../../src/modules/receivables/domain/errors/receivingSettings.error.js';
import { ReceivingSettingsController } from '../../../src/modules/receivables/presentation/http/controllers/receivingSettings.controller.js';
import { createHttpFixture, itemId, organizationId, userId } from '../support/http.fixture.js';

const route = '/api/organizations/' + organizationId + '/receiving-settings';
const actor = { organizationId, userId };
const input = {
  pixEnabled: false,
  pixKeyType: null,
  pixKey: null,
  merchantName: null,
  merchantCity: null,
  version: 0,
  confirmed: false,
};
describe('receivingSettings HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const read = vi.fn();
  const save = vi.fn();

  beforeAll(async () => {
    fixture = await createHttpFixture(
      [ReceivingSettingsController],
      [{ provide: ManageReceivingSettingsUseCase, useValue: { read, save } }],
    );
  });

  beforeEach(() => {
    read.mockReset().mockResolvedValue(input);
    save.mockReset().mockResolvedValue(input);
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('validates private Pix settings and refuses identity fields from the body', async () => {
    await request(fixture.server).put(route).send(input).expect(401);

    for (const body of [
      { ...input, version: -1 },
      { ...input, pixEnabled: 'false' },
      { ...input, pixKeyType: 'INVALID' },
      { ...input, confirmed: 'true' },
      { ...input, organizationId: itemId },
    ]) {
      await request(fixture.server).put(route).set('Authorization', 'Bearer fixture').send(body).expect(400);
    }

    expect(save).not.toHaveBeenCalled();

    await request(fixture.server).put(route).set('Authorization', 'Bearer fixture').send(input).expect(200);

    expect(save).toHaveBeenCalledWith(actor, expect.objectContaining(input));
  });

  it('keeps settings private and maps owner denial and stale versions', async () => {
    const response = await request(fixture.server).get(route).set('Authorization', 'Bearer fixture').expect(200);

    expect(response.headers['cache-control']).toContain('no-store');
    expect(read).toHaveBeenCalledWith(actor);

    read.mockRejectedValueOnce(new ReceivingSettingsError('OWNER_REQUIRED'));
    save.mockRejectedValueOnce(new ReceivingSettingsError('RECEIVING_SETTINGS_VERSION_CONFLICT'));

    await request(fixture.server).get(route).set('Authorization', 'Bearer fixture').expect(403);
    await request(fixture.server).put(route).set('Authorization', 'Bearer fixture').send(input).expect(409);
  });
});
