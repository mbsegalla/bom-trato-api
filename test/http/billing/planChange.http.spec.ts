import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CancelPlanChangeUseCase } from '../../../src/modules/billing/application/useCases/cancelPlanChange.useCase.js';
import { ConfirmPlanChangeUseCase } from '../../../src/modules/billing/application/useCases/confirmPlanChange.useCase.js';
import { GetPlanChangeUseCase } from '../../../src/modules/billing/application/useCases/getPlanChange.useCase.js';
import { PreviewPlanChangeUseCase } from '../../../src/modules/billing/application/useCases/previewPlanChange.useCase.js';
import { SyncPlanChangeUseCase } from '../../../src/modules/billing/application/useCases/syncPlanChange.useCase.js';
import { BillingError } from '../../../src/modules/billing/domain/errors/billing.error.js';
import { PlanChangeController } from '../../../src/modules/billing/presentation/http/controllers/planChange.controller.js';
import { createHttpFixture, itemId, organizationId, userId } from '../support/http.fixture.js';

const route = '/api/organizations/' + organizationId + '/billing/plan-changes';
const actor = { organizationId, userId };

describe('planChange HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const preview = vi.fn();
  const confirm = vi.fn();
  const read = vi.fn();
  const sync = vi.fn();
  const cancel = vi.fn();

  beforeAll(async () => {
    fixture = await createHttpFixture(
      [PlanChangeController],
      [
        { provide: PreviewPlanChangeUseCase, useValue: { execute: preview } },
        { provide: ConfirmPlanChangeUseCase, useValue: { execute: confirm } },
        { provide: GetPlanChangeUseCase, useValue: { execute: read } },
        { provide: SyncPlanChangeUseCase, useValue: { execute: sync } },
        { provide: CancelPlanChangeUseCase, useValue: { execute: cancel } },
      ],
    );
  });

  beforeEach(() => {
    preview.mockReset().mockResolvedValue({ id: itemId, status: 'QUOTED' });
    confirm.mockReset().mockResolvedValue({ id: itemId, status: 'QUOTED' });
    read.mockReset().mockResolvedValue({ id: itemId, status: 'QUOTED' });
    sync.mockReset().mockResolvedValue({ id: itemId, status: 'QUOTED' });
    cancel.mockReset().mockResolvedValue({ id: itemId, status: 'QUOTED' });
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('rejects invalid prices and spoofed identity before previewing a plan change', async () => {
    for (const body of [{ planPriceId: 'invalid' }, { planPriceId: itemId, userId: itemId }]) {
      await request(fixture.server)
        .post(route + '/preview')
        .set('Authorization', 'Bearer fixture')
        .send(body)
        .expect(400);
    }

    expect(preview).not.toHaveBeenCalled();

    await request(fixture.server)
      .post(route + '/preview')
      .set('Authorization', 'Bearer fixture')
      .send({ planPriceId: itemId })
      .expect(200);

    expect(preview).toHaveBeenCalledWith({ ...actor, planPriceId: itemId });
  });

  it('requires authentication and scopes each plan change action to the route identifier', async () => {
    await request(fixture.server)
      .get(route + '/' + itemId)
      .expect(401);
    await request(fixture.server)
      .post(route + '/invalid/confirm')
      .set('Authorization', 'Bearer fixture')
      .expect(400);

    expect(confirm).not.toHaveBeenCalled();

    await request(fixture.server)
      .get(route + '/' + itemId)
      .set('Authorization', 'Bearer fixture')
      .expect(200);
    await request(fixture.server)
      .post(route + '/' + itemId + '/confirm')
      .set('Authorization', 'Bearer fixture')
      .expect(200);
    await request(fixture.server)
      .post(route + '/' + itemId + '/sync')
      .set('Authorization', 'Bearer fixture')
      .expect(200);
    await request(fixture.server)
      .delete(route + '/' + itemId)
      .set('Authorization', 'Bearer fixture')
      .expect(200);

    for (const execute of [read, confirm, sync, cancel]) {
      expect(execute).toHaveBeenCalledWith({ ...actor, changeId: itemId });
    }
  });

  it('distinguishes a missing change, expired preview and a billing outage', async () => {
    read.mockRejectedValueOnce(new BillingError('PLAN_CHANGE_NOT_FOUND'));
    confirm.mockRejectedValueOnce(new BillingError('PLAN_CHANGE_QUOTE_EXPIRED'));
    sync.mockRejectedValueOnce(new BillingError('BILLING_BUSY'));

    await request(fixture.server)
      .get(route + '/' + itemId)
      .set('Authorization', 'Bearer fixture')
      .expect(404);
    await request(fixture.server)
      .post(route + '/' + itemId + '/confirm')
      .set('Authorization', 'Bearer fixture')
      .expect(409);
    await request(fixture.server)
      .post(route + '/' + itemId + '/sync')
      .set('Authorization', 'Bearer fixture')
      .expect(503);
  });
});
