import { describe, expect, it, vi } from 'vitest';

import { asymmetric } from '../../../../../test/support/asymmetricMatchers.js';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { Quote } from '../../../quotes/domain/entities/quote.entity.js';
import { QuoteItem } from '../../../quotes/domain/entities/quoteItem.entity.js';
import { WorkOrder } from '../../domain/entities/workOrder.entity.js';

import { PrismaWorkOrderRepository } from './prismaWorkOrder.repository.js';

const now = new Date('2026-01-01T00:00:00Z');
const start = new Date('2026-01-02T10:00:00Z');
const end = new Date('2026-01-02T11:00:00Z');
const actor = { organizationId: 'org', userId: 'owner' };

function makeOrder() {
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
    QuoteItem.create('item', { name: 'Fixture service', unit: 'SERVICE', quantity: '1', unitAmountInCents: 1000 }),
  );
  quote.markSent(now);
  quote.approve(now);

  return WorkOrder.create({ id: 'order', ...actor, quote: quote.snapshot(), itemIds: ['order-item'] }, now);
}

function fixture() {
  const order = makeOrder();
  const findFirst = vi.fn().mockResolvedValue(null);
  const findMany = vi.fn().mockResolvedValue([]);
  const create = vi.fn().mockResolvedValue(undefined);
  const updateMany = vi
    .fn<(args: Prisma.WorkOrderUpdateManyArgs) => Promise<{ count: number }>>()
    .mockResolvedValue({ count: 1 });
  const createStatus = vi.fn().mockResolvedValue(undefined);
  const createSchedule = vi.fn().mockResolvedValue(undefined);
  const listStatus = vi.fn().mockResolvedValue([]);
  const listSchedule = vi.fn().mockResolvedValue([]);
  const repository = new PrismaWorkOrderRepository(
    {
      workOrder: { findFirst, findMany, create, updateMany },
      workOrderStatusHistory: { create: createStatus, findMany: listStatus },
      workOrderScheduleHistory: { create: createSchedule, findMany: listSchedule },
    } as unknown as Prisma.TransactionClient,
    actor.organizationId,
  );

  return {
    order,
    repository,
    findFirst,
    findMany,
    create,
    updateMany,
    createStatus,
    createSchedule,
    listStatus,
    listSchedule,
  };
}

describe('PrismaWorkOrderRepository', () => {
  it('creates an immutable quote item snapshot and initial status history', async () => {
    const f = fixture();
    const { items, ...state } = f.order.snapshot();

    await f.repository.create(f.order);

    expect(f.create).toHaveBeenCalledWith({
      data: {
        ...state,
        workOrderItems: { create: items },
        workOrderStatusHistory: {
          create: {
            fromStatus: null,
            toStatus: 'OPEN',
            actorId: actor.userId,
            version: 1,
            reason: null,
            createdAt: now,
          },
        },
      },
    });
  });

  it('rejects cross-organization aggregate writes', async () => {
    const f = fixture();
    const foreign = WorkOrder.restore({ ...f.order.snapshot(), organizationId: 'other' });

    await expect(f.repository.create(foreign)).rejects.toThrow('WORK_ORDER_NOT_FOUND');
    await expect(f.repository.save(foreign, 1)).rejects.toThrow('WORK_ORDER_NOT_FOUND');
    expect(f.create).not.toHaveBeenCalled();
    expect(f.findFirst).not.toHaveBeenCalled();
  });

  it('scopes quote and work order identifiers and maps persisted items', async () => {
    const f = fixture();
    const { items, ...state } = f.order.snapshot();
    f.findFirst.mockResolvedValueOnce({ ...state, workOrderItems: items });

    expect(await f.repository.findByQuoteId('quote')).toEqual(f.order.snapshot());
    expect(await f.repository.findById('unknown')).toBeNull();

    expect(f.findFirst).toHaveBeenNthCalledWith(
      1,
      asymmetric.objectContaining({
        where: { quoteId: 'quote', organizationId: 'org' },
      }),
    );
    expect(f.findFirst).toHaveBeenNthCalledWith(
      2,
      asymmetric.objectContaining({
        where: { id: 'unknown', organizationId: 'org' },
      }),
    );
  });

  it('checks only active overlapping work for the assigned professional', async () => {
    const f = fixture();
    const slot = { workOrderId: 'order', assignedToId: 'worker', start, end };

    expect(await f.repository.hasScheduleConflict(slot)).toBe(false);
    f.findFirst.mockResolvedValueOnce({ id: 'conflict' });
    expect(await f.repository.hasScheduleConflict(slot)).toBe(true);

    expect(f.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        id: { not: 'order' },
        assignedToId: 'worker',
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        scheduledStartAt: { lt: end },
        scheduledEndAt: { gt: start },
      },
      select: { id: true },
    });
  });

  it('records the scheduling and status transition together and preserves immutable totals', async () => {
    const f = fixture();
    f.findFirst.mockResolvedValueOnce({
      status: 'OPEN',
      assignedToId: null,
      scheduledStartAt: null,
      scheduledEndAt: null,
    });
    f.order.assign('worker');
    f.order.update({ serviceAddress: 'Fixture address' });
    f.order.schedule(start, end, now);
    f.order.recordChange(actor.userId, now);

    await f.repository.save(f.order, 1);

    expect(f.updateMany).toHaveBeenCalledWith({
      where: { id: 'order', organizationId: 'org', version: 1 },
      data: asymmetric.objectContaining({ status: 'SCHEDULED', version: 2, assignedToId: 'worker' }),
    });
    expect(f.updateMany.mock.calls[0][0].data).not.toHaveProperty('totalInCents');
    expect(f.createSchedule).toHaveBeenCalledWith({
      data: {
        workOrderId: 'order',
        fromAssignedToId: null,
        toAssignedToId: 'worker',
        fromStartAt: null,
        fromEndAt: null,
        toStartAt: start,
        toEndAt: end,
        fromStatus: 'OPEN',
        toStatus: 'SCHEDULED',
        actorId: actor.userId,
        version: 2,
        createdAt: now,
      },
    });
    expect(f.createStatus).toHaveBeenCalledWith({
      data: {
        workOrderId: 'order',
        fromStatus: 'OPEN',
        toStatus: 'SCHEDULED',
        actorId: actor.userId,
        version: 2,
        reason: null,
        createdAt: now,
      },
    });
  });

  it('does not write history when editing notes without changing the schedule or status', async () => {
    const f = fixture();
    f.findFirst.mockResolvedValueOnce({
      status: 'OPEN',
      assignedToId: null,
      scheduledStartAt: null,
      scheduledEndAt: null,
    });
    f.order.updateExecutionNotes('Fixture notes');
    f.order.recordChange(actor.userId, now);

    await f.repository.save(f.order, 1);

    expect(f.createSchedule).not.toHaveBeenCalled();
    expect(f.createStatus).not.toHaveBeenCalled();
  });

  it('does not append history after a stale or unsuccessful compare-and-swap write', async () => {
    const f = fixture();

    await expect(f.repository.save(f.order, 1)).rejects.toThrow('WORK_ORDER_VERSION_CONFLICT');
    expect(f.updateMany).not.toHaveBeenCalled();

    f.findFirst.mockResolvedValueOnce({ status: 'OPEN' });
    f.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(f.repository.save(f.order, 1)).rejects.toThrow('WORK_ORDER_VERSION_CONFLICT');
    expect(f.createStatus).not.toHaveBeenCalled();
    expect(f.createSchedule).not.toHaveBeenCalled();
  });

  it('checks ownership before listing either history and keeps schedule pagination deterministic', async () => {
    const f = fixture();

    await expect(f.repository.listStatusHistory('order')).rejects.toThrow('WORK_ORDER_NOT_FOUND');
    await expect(f.repository.listScheduleHistory('order', { page: 2, limit: 1 })).rejects.toThrow(
      'WORK_ORDER_NOT_FOUND',
    );
    expect(f.listStatus).not.toHaveBeenCalled();
    expect(f.listSchedule).not.toHaveBeenCalled();

    f.findFirst.mockResolvedValue({ id: 'order' });
    f.listSchedule.mockResolvedValueOnce([{ version: 3 }, { version: 2 }]);

    await f.repository.listStatusHistory('order');
    expect(await f.repository.listScheduleHistory('order', { page: 2, limit: 1 })).toEqual({
      items: [{ version: 3 }],
      page: 2,
      hasMore: true,
    });
    expect(f.listStatus).toHaveBeenCalledWith({
      where: { workOrderId: 'order', workOrder: { organizationId: 'org' } },
      orderBy: [{ version: 'asc' }, { id: 'asc' }],
    });
    expect(f.listSchedule).toHaveBeenCalledWith({
      where: { workOrderId: 'order', workOrder: { organizationId: 'org' } },
      orderBy: { version: 'desc' },
      skip: 1,
      take: 2,
    });
  });
});
