import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CancelReceivableUseCase } from '../../../src/modules/receivables/application/useCases/cancelReceivable.useCase.js';
import { CreateReceivableUseCase } from '../../../src/modules/receivables/application/useCases/createReceivable.useCase.js';
import { GetReceivableUseCase } from '../../../src/modules/receivables/application/useCases/getReceivable.useCase.js';
import { ListReceivablePaymentsUseCase } from '../../../src/modules/receivables/application/useCases/listReceivablePayments.useCase.js';
import { ListReceivablesUseCase } from '../../../src/modules/receivables/application/useCases/listReceivables.useCase.js';
import { RecordReceivablePaymentUseCase } from '../../../src/modules/receivables/application/useCases/recordReceivablePayment.useCase.js';
import { ReverseReceivablePaymentUseCase } from '../../../src/modules/receivables/application/useCases/reverseReceivablePayment.useCase.js';
import { UpdateReceivableUseCase } from '../../../src/modules/receivables/application/useCases/updateReceivable.useCase.js';
import { ReceivableError } from '../../../src/modules/receivables/domain/errors/receivable.error.js';
import { ReceivablesController } from '../../../src/modules/receivables/presentation/http/controllers/receivables.controller.js';
import { createHttpFixture, itemId, organizationId, userId } from '../support/http.fixture.js';

const route = '/api/organizations/' + organizationId + '/receivables';
const itemRoute = route + '/' + itemId;
const paymentId = '44444444-4444-4444-8444-444444444444';
const actor = { organizationId, userId };
const params = { ...actor, receivableId: itemId };
const input = {
  version: 1,
  requestId: paymentId,
  amountInCents: 3001,
  method: 'PIX',
  receivedAt: '2026-01-01T00:00:00Z',
};

describe('ReceivablesController HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const create = vi.fn();
  const get = vi.fn();
  const list = vi.fn();
  const update = vi.fn();
  const cancel = vi.fn();
  const record = vi.fn();
  const reverse = vi.fn();
  const payments = vi.fn();

  beforeAll(async () => {
    fixture = await createHttpFixture(
      [ReceivablesController],
      [
        { provide: CreateReceivableUseCase, useValue: { execute: create } },
        { provide: GetReceivableUseCase, useValue: { execute: get } },
        { provide: ListReceivablesUseCase, useValue: { execute: list } },
        { provide: UpdateReceivableUseCase, useValue: { execute: update } },
        { provide: CancelReceivableUseCase, useValue: { execute: cancel } },
        { provide: RecordReceivablePaymentUseCase, useValue: { execute: record } },
        { provide: ReverseReceivablePaymentUseCase, useValue: { execute: reverse } },
        { provide: ListReceivablePaymentsUseCase, useValue: { execute: payments } },
      ],
    );
  });

  beforeEach(() => {
    for (const mock of [create, get, list, update, cancel, record, reverse, payments]) {
      mock.mockReset().mockResolvedValue({});
    }
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('requires authentication and rejects invalid route identifiers before accessing records', async () => {
    await request(fixture.server).get(itemRoute).expect(401);
    await request(fixture.server)
      .get(route + '/invalid')
      .set('Authorization', 'Bearer fixture')
      .expect(400);
    expect(get).not.toHaveBeenCalled();

    await request(fixture.server).get(itemRoute).set('Authorization', 'Bearer fixture').expect(200);
    expect(get).toHaveBeenCalledWith(params);
  });

  it('transforms explicit false and true overdue filters and rejects invalid pagination', async () => {
    for (const value of ['false', 'true']) {
      await request(fixture.server)
        .get(route)
        .set('Authorization', 'Bearer fixture')
        .query({ page: 2, limit: 5, status: 'PARTIALLY_PAID', overdue: value })
        .expect(200);

      expect(list).toHaveBeenLastCalledWith(
        actor,
        expect.objectContaining({
          page: 2,
          limit: 5,
          status: 'PARTIALLY_PAID',
          overdue: value === 'true',
        }),
      );
    }

    await request(fixture.server)
      .get(route)
      .set('Authorization', 'Bearer fixture')
      .query({ overdue: 'yes' })
      .expect(400);
    await request(fixture.server).get(route).set('Authorization', 'Bearer fixture').query({ page: 0 }).expect(400);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('rejects caller-controlled amounts and tenant identity during creation', async () => {
    const body = { workOrderId: itemId, dueAt: '2030-01-01T00:00:00Z' };

    await request(fixture.server)
      .post(route)
      .set('Authorization', 'Bearer fixture')
      .send({ ...body, amountInCents: 1 })
      .expect(400);
    await request(fixture.server)
      .post(route)
      .set('Authorization', 'Bearer fixture')
      .send({ ...body, organizationId: itemId })
      .expect(400);
    await request(fixture.server)
      .post(route)
      .set('Authorization', 'Bearer fixture')
      .send({ ...body, dueAt: '2030-01-01' })
      .expect(400);
    expect(create).not.toHaveBeenCalled();

    await request(fixture.server).post(route).set('Authorization', 'Bearer fixture').send(body).expect(200);
    expect(create).toHaveBeenCalledWith(actor, expect.objectContaining(body));
  });

  it('requires a version and a timezone-aware due date when updating', async () => {
    const body = { version: 1, dueAt: '2030-01-01T00:00:00Z', notes: null };

    await request(fixture.server)
      .patch(itemRoute)
      .set('Authorization', 'Bearer fixture')
      .send({ ...body, version: 0 })
      .expect(400);
    await request(fixture.server)
      .patch(itemRoute)
      .set('Authorization', 'Bearer fixture')
      .send({ ...body, dueAt: '2030-01-01T00:00:00' })
      .expect(400);
    expect(update).not.toHaveBeenCalled();

    await request(fixture.server).patch(itemRoute).set('Authorization', 'Bearer fixture').send(body).expect(200);
    expect(update).toHaveBeenCalledWith({ ...params, version: 1 }, expect.objectContaining(body));
  });

  it('validates request identity, integer cents and payment method before writing the ledger', async () => {
    for (const body of [
      { ...input, requestId: 'invalid' },
      { ...input, amountInCents: 1.5 },
      { ...input, amountInCents: 0 },
      { ...input, method: 'INVALID' },
      { ...input, userId: itemId },
    ]) {
      await request(fixture.server)
        .post(itemRoute + '/payments')
        .set('Authorization', 'Bearer fixture')
        .send(body)
        .expect(400);
    }
    expect(record).not.toHaveBeenCalled();

    await request(fixture.server)
      .post(itemRoute + '/payments')
      .set('Authorization', 'Bearer fixture')
      .send(input)
      .expect(200);
    expect(record).toHaveBeenCalledWith({ ...params, version: 1 }, expect.objectContaining(input));
  });

  it('requires a meaningful cancellation and reversal reason and propagates the trusted actor', async () => {
    await request(fixture.server)
      .post(itemRoute + '/cancel')
      .set('Authorization', 'Bearer fixture')
      .send({ version: 1, reason: '  a  ' })
      .expect(400);
    await request(fixture.server)
      .post(itemRoute + '/payments/' + paymentId + '/reverse')
      .set('Authorization', 'Bearer fixture')
      .send({ version: 1, reason: '  a  ' })
      .expect(400);
    expect(cancel).not.toHaveBeenCalled();
    expect(reverse).not.toHaveBeenCalled();

    await request(fixture.server)
      .post(itemRoute + '/cancel')
      .set('Authorization', 'Bearer fixture')
      .send({ version: 1, reason: '  Fixture cancellation  ' })
      .expect(200);
    await request(fixture.server)
      .post(itemRoute + '/payments/' + paymentId + '/reverse')
      .set('Authorization', 'Bearer fixture')
      .send({ version: 1, reason: '  Fixture reversal  ' })
      .expect(200);

    expect(cancel).toHaveBeenCalledWith({ ...params, version: 1 }, 'Fixture cancellation');
    expect(reverse).toHaveBeenCalledWith({ ...params, version: 1 }, paymentId, 'Fixture reversal');
  });

  it('lists payment history with the trusted receivable scope and page', async () => {
    await request(fixture.server)
      .get(itemRoute + '/payments')
      .set('Authorization', 'Bearer fixture')
      .query({ page: 3, limit: 5 })
      .expect(200);

    expect(payments).toHaveBeenCalledWith(params, expect.objectContaining({ page: 3, limit: 5 }));
  });

  it.each([
    ['IDEMPOTENCY_CONFLICT', 409],
    ['PAYMENT_EXCEEDS_BALANCE', 409],
    ['RECEIVABLE_VERSION_CONFLICT', 409],
    ['RECEIVABLE_NOT_FOUND', 404],
    ['MEMBER_REQUIRED', 403],
    ['RECEIVABLES_BUSY', 503],
  ] as const)('maps financial domain errors consistently: %s', async (code, status) => {
    record.mockRejectedValueOnce(new ReceivableError(code));

    await request(fixture.server)
      .post(itemRoute + '/payments')
      .set('Authorization', 'Bearer fixture')
      .send(input)
      .expect(status);
  });
});
