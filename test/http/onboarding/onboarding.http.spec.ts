import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { BillingError } from '../../../src/modules/billing/domain/errors/billing.error.js';
import { BootstrapOnboardingUseCase } from '../../../src/modules/onboarding/application/useCases/bootstrapOnboarding.useCase.js';
import { CompleteOnboardingBusinessUseCase } from '../../../src/modules/onboarding/application/useCases/completeOnboardingBusiness.useCase.js';
import { GetOnboardingStateUseCase } from '../../../src/modules/onboarding/application/useCases/getOnboardingState.useCase.js';
import { SelectOnboardingPlanUseCase } from '../../../src/modules/onboarding/application/useCases/selectOnboardingPlan.useCase.js';
import { OnboardingController } from '../../../src/modules/onboarding/presentation/http/controllers/onboarding.controller.js';
import { readJsonObject } from '../../support/testJson.js';
import { createHttpFixture, itemId, organizationId, userId } from '../support/http.fixture.js';

describe('onboarding HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const bootstrap = vi.fn();
  const state = vi.fn();
  const select = vi.fn();
  const complete = vi.fn();
  const auth = 'Bearer fixture';
  const actor = { organizationId, userId };

  beforeAll(async () => {
    fixture = await createHttpFixture(
      [OnboardingController],
      [
        { provide: BootstrapOnboardingUseCase, useValue: { execute: bootstrap } },
        { provide: GetOnboardingStateUseCase, useValue: { execute: state } },
        { provide: SelectOnboardingPlanUseCase, useValue: { execute: select } },
        { provide: CompleteOnboardingBusinessUseCase, useValue: { execute: complete } },
      ],
    );
  });

  beforeEach(() => {
    for (const mock of [bootstrap, state, select, complete]) {
      mock.mockReset().mockResolvedValue({});
    }
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  const route = '/api/onboarding';

  it('requires authentication and derives provisioning identity from the verified session', async () => {
    await request(fixture.server)
      .post(route + '/bootstrap')
      .expect(401);
    expect(bootstrap).not.toHaveBeenCalled();

    await request(fixture.server)
      .post(route + '/bootstrap')
      .set('Authorization', auth)
      .expect(200);

    expect(bootstrap).toHaveBeenCalledExactlyOnceWith({
      userId: actor.userId,
      email: 'owner@example.invalid',
      userName: 'Fixture',
    });
  });

  it('supports implicit and explicit organization state and rejects invalid UUIDs', async () => {
    await request(fixture.server).get(route).set('Authorization', auth).expect(200);
    await request(fixture.server).get(route).set('Authorization', auth).query({ organizationId }).expect(200);

    expect(state).toHaveBeenNthCalledWith(1, userId, undefined);
    expect(state).toHaveBeenNthCalledWith(2, userId, organizationId);

    await request(fixture.server)
      .get(route)
      .set('Authorization', auth)
      .query({ organizationId: 'invalid' })
      .expect(400);
    expect(state).toHaveBeenCalledTimes(2);
  });

  it('validates plan selection and forwards only the route-authorized actor and explicit price', async () => {
    await request(fixture.server)
      .post(route + '/plan')
      .set('Authorization', auth)
      .send({ organizationId, planPriceId: 'invalid' })
      .expect(400);
    await request(fixture.server)
      .post(route + '/plan')
      .set('Authorization', auth)
      .send({ organizationId, planPriceId: itemId, userId })
      .expect(400);
    expect(select).not.toHaveBeenCalled();

    await request(fixture.server)
      .post(route + '/plan')
      .set('Authorization', auth)
      .send({ organizationId, planPriceId: itemId })
      .expect(200);

    expect(select).toHaveBeenCalledExactlyOnceWith(userId, organizationId, itemId);
  });

  it('normalizes business names and rejects invalid or injected setup data', async () => {
    for (const body of [
      { organizationId, name: ' ' },
      { organizationId, name: 'x'.repeat(101) },
      { organizationId, name: 'Fixture', accessSource: 'SUBSCRIPTION' },
    ]) {
      await request(fixture.server)
        .post(route + '/business')
        .set('Authorization', auth)
        .send(body)
        .expect(400);
    }
    expect(complete).not.toHaveBeenCalled();

    await request(fixture.server)
      .post(route + '/business')
      .set('Authorization', auth)
      .send({ organizationId, name: '  Fixture business  ' })
      .expect(200);

    expect(complete).toHaveBeenCalledExactlyOnceWith(userId, organizationId, 'Fixture business');
  });

  it.each([
    ['OWNER_REQUIRED', 403],
    ['SUBSCRIPTION_REQUIRED', 403],
    ['ORGANIZATION_NOT_FOUND', 404],
    ['MULTIPLE_SUBSCRIPTIONS', 409],
    ['BILLING_RECONCILIATION_REQUIRED', 503],
  ] as const)('maps billing and ownership failures during business setup: %s', async (code, status) => {
    complete.mockRejectedValueOnce(new BillingError(code));

    const response = await request(fixture.server)
      .post(route + '/business')
      .set('Authorization', auth)
      .send({ organizationId, name: 'Fixture business' })
      .expect(status);

    expect(readJsonObject(readJsonObject(response.body).error).code).toBe(code);
  });
});
