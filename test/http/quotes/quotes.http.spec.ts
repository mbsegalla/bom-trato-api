import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AddQuoteItemUseCase } from '../../../src/modules/quotes/application/useCases/addQuoteItem.useCase.js';
import { ApproveQuoteUseCase } from '../../../src/modules/quotes/application/useCases/approveQuote.useCase.js';
import { CancelQuoteUseCase } from '../../../src/modules/quotes/application/useCases/cancelQuote.useCase.js';
import { CreateQuoteUseCase } from '../../../src/modules/quotes/application/useCases/createQuote.useCase.js';
import { DeclineQuoteUseCase } from '../../../src/modules/quotes/application/useCases/declineQuote.useCase.js';
import { GenerateQuotePdfUseCase } from '../../../src/modules/quotes/application/useCases/generateQuotePdf.useCase.js';
import { GetQuoteUseCase } from '../../../src/modules/quotes/application/useCases/getQuote.useCase.js';
import { ListQuotesUseCase } from '../../../src/modules/quotes/application/useCases/listQuotes.useCase.js';
import { ListQuoteStatusHistoryUseCase } from '../../../src/modules/quotes/application/useCases/listQuoteStatusHistory.useCase.js';
import { RemoveQuoteItemUseCase } from '../../../src/modules/quotes/application/useCases/removeQuoteItem.useCase.js';
import { ReplaceQuoteItemUseCase } from '../../../src/modules/quotes/application/useCases/replaceQuoteItem.useCase.js';
import { SendQuoteUseCase } from '../../../src/modules/quotes/application/useCases/sendQuote.useCase.js';
import { UpdateQuoteUseCase } from '../../../src/modules/quotes/application/useCases/updateQuote.useCase.js';
import { QuoteError } from '../../../src/modules/quotes/domain/errors/quote.error.js';
import { QuotesController } from '../../../src/modules/quotes/presentation/http/controllers/quotes.controller.js';
import { asymmetric } from '../../support/asymmetricMatchers.js';
import { readJsonObject } from '../../support/testJson.js';
import { createHttpFixture, itemId, organizationId, userId } from '../support/http.fixture.js';

const route = '/api/organizations/' + organizationId + '/quotes';
const quoteId = itemId;
const lineId = '44444444-4444-4444-8444-444444444444';
const actor = { organizationId, userId };
const params = { ...actor, quoteId };
const version = 3;
const quote = { id: quoteId, version, status: 'DRAFT' };
const body = { customerId: lineId, title: 'Fixture quote' };
const custom = { name: 'Fixture service', unit: 'SERVICE', unitAmountInCents: 1000 };
const auth = 'Bearer fixture';

describe('private quote HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const create = vi.fn();
  const list = vi.fn();
  const get = vi.fn();
  const pdf = vi.fn();
  const update = vi.fn();
  const add = vi.fn();
  const replace = vi.fn();
  const remove = vi.fn();
  const send = vi.fn();
  const approve = vi.fn();
  const decline = vi.fn();
  const cancel = vi.fn();
  const history = vi.fn();

  beforeAll(async () => {
    fixture = await createHttpFixture(
      [QuotesController],
      [
        { provide: CreateQuoteUseCase, useValue: { execute: create } },
        { provide: ListQuotesUseCase, useValue: { execute: list } },
        { provide: GetQuoteUseCase, useValue: { execute: get } },
        { provide: GenerateQuotePdfUseCase, useValue: { execute: pdf } },
        { provide: UpdateQuoteUseCase, useValue: { execute: update } },
        { provide: AddQuoteItemUseCase, useValue: { execute: add } },
        { provide: ReplaceQuoteItemUseCase, useValue: { execute: replace } },
        { provide: RemoveQuoteItemUseCase, useValue: { execute: remove } },
        { provide: SendQuoteUseCase, useValue: { execute: send } },
        { provide: ApproveQuoteUseCase, useValue: { execute: approve } },
        { provide: DeclineQuoteUseCase, useValue: { execute: decline } },
        { provide: CancelQuoteUseCase, useValue: { execute: cancel } },
        { provide: ListQuoteStatusHistoryUseCase, useValue: { execute: history } },
      ],
    );
  });

  beforeEach(() => {
    for (const operation of [
      create,
      list,
      get,
      pdf,
      update,
      add,
      replace,
      remove,
      send,
      approve,
      decline,
      cancel,
      history,
    ]) {
      operation.mockReset().mockResolvedValue(quote);
    }
    list.mockResolvedValue({ items: [quote], page: 1, hasMore: false });
    history.mockResolvedValue([]);
    pdf.mockResolvedValue({ content: Buffer.from('%PDF-fixture'), filename: 'quote-fixture.pdf' });
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('requires authentication before creating or reading quotes', async () => {
    await request(fixture.server).post(route).send(body).expect(401);
    await request(fixture.server)
      .get(route + '/' + quoteId)
      .expect(401);
    expect(create).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('creates a scoped draft with a normalized title and explicit nullable fields', async () => {
    await request(fixture.server)
      .post(route)
      .set('Authorization', auth)
      .send({ ...body, title: '  Fixture quote  ', notes: null, validUntil: null, downPaymentPercentage: null })
      .expect(201);
    expect(create).toHaveBeenCalledExactlyOnceWith(
      actor,
      asymmetric.objectContaining({
        ...body,
        notes: null,
        validUntil: null,
        downPaymentPercentage: null,
      }),
    );
  });

  it.each([
    { title: 1 },
    { title: ' ' },
    { title: 'x'.repeat(151) },
    { customerId: 'invalid' },
    { notes: 1 },
    { notes: 'x'.repeat(5001) },
    { validUntil: '2030-01-01' },
    { validUntil: '2030-01-01T12:00:00' },
    { validUntil: '2030-02-30T12:00:00Z' },
    { paymentCondition: null },
    { paymentCondition: 'OTHER' },
    { downPaymentPercentage: 0 },
    { downPaymentPercentage: 100 },
    { downPaymentPercentage: 1.5 },
    { organizationId: lineId },
    { status: 'APPROVED' },
    { totalInCents: 1 },
  ])('rejects invalid draft fields: %j', async (patch) => {
    await request(fixture.server)
      .post(route)
      .set('Authorization', auth)
      .send({ ...body, ...patch })
      .expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('passes pagination and selected status and customer filters with the authenticated tenant', async () => {
    await request(fixture.server)
      .get(route)
      .set('Authorization', auth)
      .query({ page: 2, limit: 5, status: 'SENT', customerId: lineId })
      .expect(200);
    expect(list).toHaveBeenCalledExactlyOnceWith(
      actor,
      asymmetric.objectContaining({ page: 2, limit: 5, status: 'SENT', customerId: lineId }),
    );
  });

  it.each([{ status: 'OTHER' }, { customerId: 'bad' }, { page: 0 }, { userId }])(
    'rejects invalid quote listing filters: %j',
    async (query) => {
      await request(fixture.server).get(route).set('Authorization', auth).query(query).expect(400);
      expect(list).not.toHaveBeenCalled();
    },
  );

  it('reads quote details and status history with the same scoped identifier', async () => {
    await request(fixture.server)
      .get(route + '/' + quoteId)
      .set('Authorization', auth)
      .expect(200);
    await request(fixture.server)
      .get(route + '/' + quoteId + '/status-history')
      .set('Authorization', auth)
      .expect(200);
    expect(get).toHaveBeenCalledExactlyOnceWith(params);
    expect(history).toHaveBeenCalledExactlyOnceWith(params);
  });

  it('returns a private PDF download with a versioned attachment and no JSON envelope', async () => {
    const response = await request(fixture.server)
      .get(route + '/' + quoteId + '/pdf')
      .set('Authorization', auth)
      .expect(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toBe('attachment; filename="quote-fixture.pdf"');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(pdf).toHaveBeenCalledExactlyOnceWith(params);
  });

  it('updates versioned draft fields without coercing false or zero values', async () => {
    await request(fixture.server)
      .patch(route + '/' + quoteId)
      .set('Authorization', auth)
      .send({ version, title: ' Revised quote ', discountInCents: 0, notes: null })
      .expect(200);
    expect(update).toHaveBeenCalledWith(
      { ...params, version },
      asymmetric.objectContaining({
        version,
        title: 'Revised quote',
        discountInCents: 0,
        notes: null,
      }),
    );
  });

  it.each([
    { version: 0 },
    { version: '3' },
    { discountInCents: -1 },
    { discountInCents: null },
    { discountInCents: 2147483648 },
  ])('rejects invalid versioned changes: %j', async (patch) => {
    await request(fixture.server)
      .patch(route + '/' + quoteId)
      .set('Authorization', auth)
      .send({ version, ...patch })
      .expect(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('passes a catalog item and a normalized custom item without trusting extra price fields', async () => {
    await request(fixture.server)
      .post(route + '/' + quoteId + '/items')
      .set('Authorization', auth)
      .send({ version, quantity: '1.500', catalogServiceId: lineId })
      .expect(200);
    expect(add).toHaveBeenCalledWith(
      { ...params, version },
      asymmetric.objectContaining({ version, quantity: '1.500', catalogServiceId: lineId }),
    );
    await request(fixture.server)
      .put(route + '/' + quoteId + '/items/' + lineId)
      .set('Authorization', auth)
      .send({ version, quantity: '2', custom: { ...custom, name: ' Fixture service ', description: null } })
      .expect(200);
    expect(replace).toHaveBeenCalledWith(
      { ...params, version, itemId: lineId },
      asymmetric.objectContaining({
        quantity: '2',
        custom: asymmetric.objectContaining({ ...custom, description: null }),
      }),
    );
  });

  it.each([
    { quantity: 1 },
    { quantity: '1,5' },
    { quantity: '-1' },
    { quantity: '1.0001' },
    { catalogServiceId: null },
    { catalogServiceId: 'invalid' },
    { custom: null },
    { custom: { ...custom, name: 1 } },
    { custom: { ...custom, unit: 'UNKNOWN' } },
    { custom: { ...custom, unitAmountInCents: -1 } },
    { custom: { ...custom, description: 1 } },
    { custom: { ...custom, organizationId } },
  ])('rejects invalid nested quote items: %j', async (patch) => {
    await request(fixture.server)
      .post(route + '/' + quoteId + '/items')
      .set('Authorization', auth)
      .send({ version, quantity: '1', ...patch })
      .expect(400);
    expect(add).not.toHaveBeenCalled();
  });

  it('removes an item with the expected version and scoped identifiers', async () => {
    await request(fixture.server)
      .delete(route + '/' + quoteId + '/items/' + lineId)
      .set('Authorization', auth)
      .send({ version })
      .expect(200);
    expect(remove).toHaveBeenCalledExactlyOnceWith({ ...params, version, itemId: lineId });
  });

  it('uses the exact authenticated actor and optimistic version for each quote transition', async () => {
    for (const [action, operation] of [
      ['send', send],
      ['approve', approve],
      ['decline', decline],
      ['cancel', cancel],
    ] as const) {
      await request(fixture.server)
        .post(route + '/' + quoteId + '/' + action)
        .set('Authorization', auth)
        .send({ version })
        .expect(200);
      expect(operation).toHaveBeenCalledExactlyOnceWith({ ...params, version });
    }
  });

  it.each([
    ['QUOTE_VERSION_CONFLICT', 409],
    ['MEMBER_REQUIRED', 403],
    ['QUOTE_NOT_FOUND', 404],
    ['INVALID_QUOTE_INPUT', 400],
    ['QUOTES_BUSY', 503],
    ['BILLING_RECONCILIATION_REQUIRED', 503],
  ] as const)('maps %s without returning success for a failed mutation', async (code, status) => {
    approve.mockRejectedValueOnce(new QuoteError(code));
    const response = await request(fixture.server)
      .post(route + '/' + quoteId + '/approve')
      .set('Authorization', auth)
      .send({ version })
      .expect(status);
    expect(readJsonObject(readJsonObject(response.body).error).code).toBe(code);
  });
});
