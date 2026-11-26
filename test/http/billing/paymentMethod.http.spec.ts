import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CompletePaymentMethodUpdateUseCase } from '../../../src/modules/billing/application/useCases/completePaymentMethodUpdate.useCase.js';
import { GetPaymentMethodUseCase } from '../../../src/modules/billing/application/useCases/getPaymentMethod.useCase.js';
import { StartPaymentMethodUpdateUseCase } from '../../../src/modules/billing/application/useCases/startPaymentMethodUpdate.useCase.js';
import { BillingError } from '../../../src/modules/billing/domain/errors/billing.error.js';
import { PaymentMethodController } from '../../../src/modules/billing/presentation/http/controllers/paymentMethod.controller.js';
import { createHttpFixture, itemId, organizationId, userId } from '../support/http.fixture.js';

const route = '/api/organizations/' + organizationId + '/billing/payment-method';
const actor = { organizationId, userId };

describe('paymentMethod HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const current = vi.fn();
  const start = vi.fn();
  const complete = vi.fn();

  beforeAll(async () => {
    fixture = await createHttpFixture(
      [PaymentMethodController],
      [
        { provide: GetPaymentMethodUseCase, useValue: { execute: current } },
        { provide: StartPaymentMethodUpdateUseCase, useValue: { execute: start } },
        { provide: CompletePaymentMethodUpdateUseCase, useValue: { execute: complete } },
      ],
    );
  });

  beforeEach(() => {
    current.mockReset().mockResolvedValue({ brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 });
    start.mockReset().mockResolvedValue({ updateId: itemId, status: 'PENDING', clientSecret: 'fixture-secret' });
    complete.mockReset().mockResolvedValue({ updateId: itemId, status: 'APPLIED', clientSecret: null });
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('requires authentication and explicit boolean consent before starting a card update', async () => {
    await request(fixture.server)
      .post(route + '/setup')
      .send({ accepted: true })
      .expect(401);

    for (const body of [{}, { accepted: false }, { accepted: 'true' }, { accepted: true, userId: itemId }]) {
      await request(fixture.server)
        .post(route + '/setup')
        .set('Authorization', 'Bearer fixture')
        .send(body)
        .expect(400);
    }

    expect(start).not.toHaveBeenCalled();

    await request(fixture.server)
      .post(route + '/setup')
      .set('Authorization', 'Bearer fixture')
      .send({ accepted: true })
      .expect(200);

    expect(start).toHaveBeenCalledWith(actor);
  });

  it('reads a scoped card and completes only a valid update identifier', async () => {
    await request(fixture.server).get(route).set('Authorization', 'Bearer fixture').expect(200);
    await request(fixture.server)
      .post(route + '/updates/invalid/complete')
      .set('Authorization', 'Bearer fixture')
      .expect(400);

    expect(current).toHaveBeenCalledWith(actor);
    expect(complete).not.toHaveBeenCalled();

    await request(fixture.server)
      .post(route + '/updates/' + itemId + '/complete')
      .set('Authorization', 'Bearer fixture')
      .expect(200);

    expect(complete).toHaveBeenCalledWith({ ...actor, updateId: itemId });
  });

  it('maps unauthorized card lookup and invalid update state to their domain status codes', async () => {
    current.mockRejectedValueOnce(new BillingError('OWNER_REQUIRED'));
    complete.mockRejectedValueOnce(new BillingError('INVALID_PAYMENT_METHOD_UPDATE'));

    await request(fixture.server).get(route).set('Authorization', 'Bearer fixture').expect(403);
    await request(fixture.server)
      .post(route + '/updates/' + itemId + '/complete')
      .set('Authorization', 'Bearer fixture')
      .expect(409);
  });
});
