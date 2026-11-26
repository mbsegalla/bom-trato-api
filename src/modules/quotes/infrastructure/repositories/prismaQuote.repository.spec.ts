import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { Quote } from '../../domain/entities/quote.entity.js';
import { QuoteItem } from '../../domain/entities/quoteItem.entity.js';

import { PrismaQuoteRepository } from './prismaQuote.repository.js';

const now = new Date('2026-01-01T00:00:00Z');
const actor = { organizationId: 'org', userId: 'owner' };

function makeQuote() {
  const quote = Quote.create(
    {
      id: 'quote',
      ...actor,
      customer: { id: 'customer', name: 'Fixture', email: null, phone: null },
      details: { title: 'Fixture service' },
    },
    now,
  );

  quote.addItem(
    QuoteItem.create('first', { name: 'First service', unit: 'SERVICE', quantity: '1', unitAmountInCents: 1000 }),
  );
  quote.addItem(
    QuoteItem.create('second', { name: 'Second service', unit: 'SERVICE', quantity: '1', unitAmountInCents: 2000 }),
  );

  return quote;
}

function fixture() {
  const quote = makeQuote();
  const findFirst = vi.fn().mockResolvedValue(null);
  const findMany = vi.fn().mockResolvedValue([]);
  const create = vi.fn().mockResolvedValue(undefined);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const deleteItems = vi.fn().mockResolvedValue({ count: 1 });
  const createItems = vi.fn().mockResolvedValue({ count: 1 });
  const updateItems = vi.fn().mockResolvedValue({ count: 1 });
  const createHistory = vi.fn().mockResolvedValue(undefined);
  const listHistory = vi.fn().mockResolvedValue([]);
  const repository = new PrismaQuoteRepository(
    {
      quote: { findFirst, findMany, create, updateMany },
      quoteItem: { deleteMany: deleteItems, createMany: createItems, updateMany: updateItems },
      quoteStatusHistory: { create: createHistory, findMany: listHistory },
    } as unknown as Prisma.TransactionClient,
    actor.organizationId,
  );

  return {
    quote,
    repository,
    findFirst,
    findMany,
    create,
    updateMany,
    deleteItems,
    createItems,
    updateItems,
    createHistory,
    listHistory,
  };
}

describe('PrismaQuoteRepository', () => {
  it('creates ordered items and the initial status history with the aggregate', async () => {
    const f = fixture();
    const { items, ...state } = f.quote.snapshot();

    await f.repository.create(f.quote);

    expect(f.create).toHaveBeenCalledWith({
      data: {
        ...state,
        quoteItems: { create: items },
        quoteStatusHistories: {
          create: { fromStatus: null, toStatus: 'DRAFT', actorId: actor.userId, version: 1, createdAt: now },
        },
      },
    });
  });

  it('denies foreign aggregate writes without querying persistence', async () => {
    const f = fixture();
    const foreign = Quote.restore({ ...f.quote.snapshot(), organizationId: 'foreign' });

    await expect(f.repository.create(foreign)).rejects.toThrow('QUOTE_NOT_FOUND');
    await expect(f.repository.save(foreign, 1)).rejects.toThrow('QUOTE_NOT_FOUND');
    expect(f.create).not.toHaveBeenCalled();
    expect(f.findFirst).not.toHaveBeenCalled();
  });

  it('maps nested persisted items back to the domain and scopes list pagination', async () => {
    const f = fixture();
    const { items, ...state } = f.quote.snapshot();
    f.findFirst.mockResolvedValueOnce({ ...state, quoteItems: items });
    f.findMany.mockResolvedValueOnce([state, { ...state, id: 'next' }]);

    expect(await f.repository.findById(state.id)).toEqual(f.quote.snapshot());
    expect(await f.repository.findById('unknown')).toBeNull();
    expect(await f.repository.list({ page: 2, limit: 1, status: 'DRAFT' })).toMatchObject({
      items: [state],
      page: 2,
      hasMore: true,
    });
    expect(f.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org', status: 'DRAFT', customerId: undefined },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 1,
        take: 2,
      }),
    );
  });

  it('applies item differences without recreating unchanged records or adding status history', async () => {
    const f = fixture();
    const original = f.quote.snapshot();
    f.findFirst.mockResolvedValueOnce({ status: original.status, quoteItems: original.items });

    f.quote.replaceItem(
      'first',
      QuoteItem.create('first', { name: 'Updated service', unit: 'SERVICE', quantity: '2', unitAmountInCents: 1000 }),
    );
    f.quote.removeItem('second');
    f.quote.addItem(
      QuoteItem.create('third', { name: 'New service', unit: 'SERVICE', quantity: '1', unitAmountInCents: 3000 }),
    );
    f.quote.recordChange(actor.userId, now);

    await f.repository.save(f.quote, 1);

    expect(f.deleteItems).toHaveBeenCalledWith({
      where: { quoteId: 'quote', id: { in: ['second'] }, quote: { organizationId: 'org' } },
    });
    expect(f.createItems).toHaveBeenCalledWith({ data: [expect.objectContaining({ id: 'third', quoteId: 'quote' })] });
    expect(f.updateItems).toHaveBeenCalledWith({
      where: { id: 'first', quoteId: 'quote', quote: { organizationId: 'org' } },
      data: expect.objectContaining({ name: 'Updated service', quantityInThousandths: 2000, totalInCents: 2000 }),
    });
    expect(f.createHistory).not.toHaveBeenCalled();
  });

  it('writes status history only for a genuine transition and leaves unchanged items untouched', async () => {
    const f = fixture();
    const original = f.quote.snapshot();
    f.findFirst.mockResolvedValueOnce({ status: 'DRAFT', quoteItems: original.items });
    f.quote.markSent(now);
    f.quote.recordChange(actor.userId, now);

    await f.repository.save(f.quote, 1);

    expect(f.createHistory).toHaveBeenCalledWith({
      data: {
        quoteId: 'quote',
        fromStatus: 'DRAFT',
        toStatus: 'SENT',
        actorId: actor.userId,
        version: 2,
        createdAt: now,
      },
    });
    expect(f.updateItems).not.toHaveBeenCalled();
    expect(f.deleteItems).not.toHaveBeenCalled();
    expect(f.createItems).not.toHaveBeenCalled();
  });

  it('rejects stale aggregate versions before updating items and histories', async () => {
    const f = fixture();

    await expect(f.repository.save(f.quote, 1)).rejects.toThrow('QUOTE_VERSION_CONFLICT');
    expect(f.updateMany).not.toHaveBeenCalled();

    f.findFirst.mockResolvedValueOnce({ status: 'DRAFT', quoteItems: f.quote.snapshot().items });
    f.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(f.repository.save(f.quote, 1)).rejects.toThrow('QUOTE_VERSION_CONFLICT');
    expect(f.updateItems).not.toHaveBeenCalled();
    expect(f.createHistory).not.toHaveBeenCalled();
  });

  it('requires tenant ownership before reading ordered status history', async () => {
    const f = fixture();

    await expect(f.repository.listStatusHistory('quote')).rejects.toThrow('QUOTE_NOT_FOUND');
    expect(f.listHistory).not.toHaveBeenCalled();

    f.findFirst.mockResolvedValueOnce({ id: 'quote' });
    await f.repository.listStatusHistory('quote');

    expect(f.listHistory).toHaveBeenCalledWith({
      where: { quoteId: 'quote', quote: { organizationId: 'org' } },
      orderBy: [{ version: 'asc' }, { id: 'asc' }],
    });
  });
});
