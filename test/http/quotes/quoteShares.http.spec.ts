import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { appConfig } from '../../../src/config/app.config.js';
import { CreateQuoteShareUseCase } from '../../../src/modules/quotes/application/useCases/createQuoteShare.useCase.js';
import { RevokeQuoteShareUseCase } from '../../../src/modules/quotes/application/useCases/revokeQuoteShare.useCase.js';
import { QuoteShareError } from '../../../src/modules/quotes/domain/errors/quoteShare.error.js';
import { QuoteSharesController } from '../../../src/modules/quotes/presentation/http/controllers/quoteShares.controller.js';
import { readJsonObject, readJsonString } from '../../support/testJson.js';
import { createHttpFixture, itemId, organizationId, userId } from '../support/http.fixture.js';

const route = '/api/organizations/' + organizationId + '/quotes/' + itemId + '/share';
const actor = { organizationId, userId };
const token = 'a'.repeat(64);
const expiresAt = '2030-01-01T00:00:00Z';
describe('quoteShares HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const create = vi.fn();
  const revoke = vi.fn();

  beforeAll(async () => {
    fixture = await createHttpFixture(
      [QuoteSharesController],
      [
        { provide: CreateQuoteShareUseCase, useValue: { execute: create } },
        { provide: RevokeQuoteShareUseCase, useValue: { execute: revoke } },
        { provide: appConfig.KEY, useValue: { frontendUrl: 'https://app.example.invalid' } },
      ],
    );
  });

  beforeEach(() => {
    create.mockReset().mockResolvedValue({ id: itemId, token, quoteVersion: 2, expiresAt: new Date(expiresAt) });
    revoke.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('requires an authenticated actor, a valid version and a timezone-aware expiration', async () => {
    await request(fixture.server).post(route).send({ version: 2, expiresAt }).expect(401);

    for (const body of [
      { version: 0, expiresAt },
      { version: 2, expiresAt: 'invalid' },
      { version: 2, expiresAt, userId: itemId },
    ]) {
      await request(fixture.server).post(route).set('Authorization', 'Bearer fixture').send(body).expect(400);
    }

    expect(create).not.toHaveBeenCalled();
  });

  it('places the private share token in the URL fragment rather than a query parameter', async () => {
    const response = await request(fixture.server)
      .post(route)
      .set('Authorization', 'Bearer fixture')
      .send({ version: 2, expiresAt })
      .expect(201);
    const url = new URL(readJsonString(readJsonObject(readJsonObject(response.body).data).url));

    expect(url.origin).toBe('https://app.example.invalid');
    expect(url.pathname).toBe('/quote-share');
    expect(url.search).toBe('');
    expect(url.hash).toBe('#token=' + token);
    expect(readJsonObject(response.body).data).not.toHaveProperty('token');
    expect(response.headers['cache-control']).toContain('no-store');
    expect(create).toHaveBeenCalledWith({ ...actor, quoteId: itemId, version: 2 }, expiresAt);
  });

  it('scopes revocation and maps invalid expiration failures', async () => {
    create.mockRejectedValueOnce(new QuoteShareError('INVALID_QUOTE_SHARE_EXPIRATION'));

    await request(fixture.server)
      .post(route)
      .set('Authorization', 'Bearer fixture')
      .send({ version: 2, expiresAt })
      .expect(400);
    await request(fixture.server).delete(route).set('Authorization', 'Bearer fixture').expect(204);

    expect(revoke).toHaveBeenCalledWith({ ...actor, quoteId: itemId });
  });
});
