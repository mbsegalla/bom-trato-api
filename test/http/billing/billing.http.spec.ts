import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CancelSubscriptionUseCase } from '../../../src/modules/billing/application/useCases/cancelSubscription.useCase.js';
import { CreateBillingPortalUseCase } from '../../../src/modules/billing/application/useCases/createBillingPortal.useCase.js';
import { GetEntitlementsUseCase } from '../../../src/modules/billing/application/useCases/getEntitlements.useCase.js';
import { GetSubscriptionUseCase } from '../../../src/modules/billing/application/useCases/getSubscription.useCase.js';
import { ListBillingInvoicesUseCase } from '../../../src/modules/billing/application/useCases/listBillingInvoices.useCase.js';
import { RefreshBillingUseCase } from '../../../src/modules/billing/application/useCases/refreshBilling.useCase.js';
import { ResumeSubscriptionUseCase } from '../../../src/modules/billing/application/useCases/resumeSubscription.useCase.js';
import { StartCheckoutUseCase } from '../../../src/modules/billing/application/useCases/startCheckout.useCase.js';
import { BillingError } from '../../../src/modules/billing/domain/errors/billing.error.js';
import { BillingController } from '../../../src/modules/billing/presentation/http/controllers/billing.controller.js';
import { readJsonObject } from '../../support/testJson.js';
import { createHttpFixture, itemId, organizationId, userId } from '../support/http.fixture.js';

const route = '/api/organizations/' + organizationId + '/billing';
const actor = { organizationId, userId };

describe('billing HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const checkout = vi.fn();
  const subscription = vi.fn();
  const invoices = vi.fn();
  const entitlements = vi.fn();
  const cancel = vi.fn();
  const resume = vi.fn();
  const portal = vi.fn();
  const sync = vi.fn();

  beforeAll(async () => {
    fixture = await createHttpFixture(
      [BillingController],
      [
        { provide: StartCheckoutUseCase, useValue: { execute: checkout } },
        { provide: GetSubscriptionUseCase, useValue: { execute: subscription } },
        { provide: ListBillingInvoicesUseCase, useValue: { execute: invoices } },
        { provide: GetEntitlementsUseCase, useValue: { execute: entitlements } },
        { provide: CancelSubscriptionUseCase, useValue: { execute: cancel } },
        { provide: ResumeSubscriptionUseCase, useValue: { execute: resume } },
        { provide: CreateBillingPortalUseCase, useValue: { execute: portal } },
        { provide: RefreshBillingUseCase, useValue: { execute: sync } },
      ],
    );
  });

  beforeEach(() => {
    checkout.mockReset().mockResolvedValue({ url: 'https://billing.example.invalid/checkout' });
    subscription.mockReset().mockResolvedValue(null);
    invoices.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    entitlements.mockReset().mockResolvedValue({
      hasAccess: true,
      maxUsers: 2,
      memberCount: 1,
      teamManagementEnabled: true,
      canAddMember: true,
    });
    cancel.mockReset().mockResolvedValue(undefined);
    resume.mockReset().mockResolvedValue(undefined);
    portal.mockReset().mockResolvedValue({ url: 'https://billing.example.invalid/portal' });
    sync.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('rejects missing auth and spoofed checkout identity before executing billing operations', async () => {
    await request(fixture.server)
      .post(route + '/checkout')
      .send({ planPriceId: itemId })
      .expect(401);

    for (const body of [
      { planPriceId: 'invalid' },
      { planPriceId: itemId, userId: itemId },
      { planPriceId: itemId, organizationId: itemId },
    ]) {
      await request(fixture.server)
        .post(route + '/checkout')
        .set('Authorization', 'Bearer fixture')
        .send(body)
        .expect(400);
    }

    expect(checkout).not.toHaveBeenCalled();

    await request(fixture.server)
      .post(route + '/checkout')
      .set('Authorization', 'Bearer fixture')
      .send({ planPriceId: itemId })
      .expect(200);

    expect(checkout).toHaveBeenCalledWith({ ...actor, planPriceId: itemId });
  });

  it('validates invoice pagination and passes the authenticated scope and numeric limit', async () => {
    for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'cursor=invalid', 'userId=' + itemId]) {
      await request(fixture.server)
        .get(route + '/invoices?' + query)
        .set('Authorization', 'Bearer fixture')
        .expect(400);
    }

    expect(invoices).not.toHaveBeenCalled();

    const response = await request(fixture.server)
      .get(route + '/invoices?limit=12&cursor=' + itemId)
      .set('Authorization', 'Bearer fixture')
      .expect(200);

    expect(readJsonObject(response.body).data).toEqual({ items: [], nextCursor: null });
    expect(invoices).toHaveBeenCalledWith({ ...actor, cursor: itemId, limit: 12 });
  });

  it('reads the subscription and plan limits under the authenticated identity', async () => {
    await request(fixture.server)
      .get(route + '/subscription')
      .set('Authorization', 'Bearer fixture')
      .expect(200);
    await request(fixture.server)
      .get(route + '/entitlements')
      .set('Authorization', 'Bearer fixture')
      .expect(200);

    expect(subscription).toHaveBeenCalledWith(actor);
    expect(entitlements).toHaveBeenCalledWith(actor);
  });

  it('returns no content for scoped cancellation, renewal and reconciliation', async () => {
    for (const action of ['cancel', 'resume', 'sync']) {
      const response = await request(fixture.server)
        .post(route + '/' + action)
        .set('Authorization', 'Bearer fixture')
        .expect(204);

      expect(response.text).toBe('');
    }

    expect(cancel).toHaveBeenCalledWith(actor);
    expect(resume).toHaveBeenCalledWith(actor);
    expect(sync).toHaveBeenCalledWith(actor);
  });

  it('maps owner, conflict and temporary billing failures to distinct HTTP statuses', async () => {
    portal.mockRejectedValueOnce(new BillingError('OWNER_REQUIRED'));
    checkout.mockRejectedValueOnce(new BillingError('PRICE_MISMATCH'));
    sync.mockRejectedValueOnce(new BillingError('BILLING_RECONCILIATION_REQUIRED'));

    await request(fixture.server)
      .post(route + '/portal')
      .set('Authorization', 'Bearer fixture')
      .expect(403);
    await request(fixture.server)
      .post(route + '/checkout')
      .set('Authorization', 'Bearer fixture')
      .send({ planPriceId: itemId })
      .expect(409);
    await request(fixture.server)
      .post(route + '/sync')
      .set('Authorization', 'Bearer fixture')
      .expect(503);
  });
});
