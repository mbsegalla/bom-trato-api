import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { Receivable, type ReceivableProps } from '../../domain/entities/receivable.entity.js';
import { ReceivablePayment } from '../../domain/entities/receivablePayment.entity.js';
import { PrismaReceivableRepository } from './prismaReceivable.repository.js';

const now = new Date('2026-01-01T12:00:00Z');
const state: ReceivableProps = {
  id: 'receivable',
  organizationId: 'org',
  workOrderId: 'order',
  kind: 'FULL',
  customerId: 'customer',
  customerName: 'Fixture customer',
  title: 'Fixture service',
  currency: 'brl',
  amountInCents: 10000,
  receivedInCents: 3000,
  status: 'PARTIALLY_PAID',
  dueAt: now,
  notes: null,
  canceledAt: null,
  canceledById: null,
  cancellationReason: null,
  version: 2,
  createdById: 'owner',
  updatedById: 'owner',
  createdAt: now,
  updatedAt: now,
};
const payment = ReceivablePayment.create({
  id: 'payment',
  receivableId: state.id,
  requestId: 'request',
  amountInCents: 3000,
  method: 'PIX',
  receivedAt: now,
  recordedById: 'owner',
}, now);

function fixture() {
  const create = vi.fn().mockResolvedValue(undefined);
  const findFirst = vi.fn().mockResolvedValue(null);
  const findMany = vi.fn().mockResolvedValue([]);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const createPayment = vi.fn().mockResolvedValue(undefined);
  const findPayment = vi.fn().mockResolvedValue(null);
  const listPayments = vi.fn().mockResolvedValue([]);
  const reversePayment = vi.fn().mockResolvedValue({ count: 1 });
  const repository = new PrismaReceivableRepository({
    receivable: { create, findFirst, findMany, updateMany },
    receivablePayment: {
      create: createPayment,
      findFirst: findPayment,
      findMany: listPayments,
      updateMany: reversePayment,
    },
  } as unknown as Prisma.TransactionClient, state.organizationId);

  return { repository, create, findFirst, findMany, updateMany, createPayment, findPayment, listPayments, reversePayment };
}

describe('PrismaReceivableRepository', () => {
  it('rejects cross-tenant writes before invoking persistence', async () => {
    const f = fixture();
    const foreign = Receivable.restore({ ...state, organizationId: 'other' });

    await expect(f.repository.create(foreign)).rejects.toThrow('RECEIVABLE_NOT_FOUND');
    await expect(f.repository.save(foreign, 1)).rejects.toThrow('RECEIVABLE_NOT_FOUND');

    expect(f.create).not.toHaveBeenCalled();
    expect(f.updateMany).not.toHaveBeenCalled();
  });

  it('creates only the scoped receivable and never changes immutable financial identity on save', async () => {
    const f = fixture();
    const receivable = Receivable.restore(state);

    await f.repository.create(receivable);
    await f.repository.save(receivable, 1);

    expect(f.create).toHaveBeenCalledWith({ data: state });
    expect(f.updateMany).toHaveBeenCalledWith({
      where: { id: state.id, organizationId: state.organizationId, version: 1 },
      data: {
        receivedInCents: state.receivedInCents,
        status: state.status,
        dueAt: state.dueAt,
        notes: state.notes,
        canceledAt: null,
        canceledById: null,
        cancellationReason: null,
        version: 2,
        updatedById: state.updatedById,
        updatedAt: now,
      },
    });
  });

  it('rejects invalid version increments and failed compare-and-swap writes', async () => {
    const f = fixture();
    const receivable = Receivable.restore(state);

    await expect(f.repository.save(receivable, 2)).rejects.toThrow('RECEIVABLE_VERSION_CONFLICT');
    expect(f.updateMany).not.toHaveBeenCalled();

    f.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(f.repository.save(receivable, 1)).rejects.toThrow('RECEIVABLE_VERSION_CONFLICT');
  });

  it('scopes all financial reads and maintains deterministic ordering', async () => {
    const f = fixture();

    await f.repository.findById(state.id);
    await f.repository.findByWorkOrderId(state.workOrderId);
    await f.repository.findByWorkOrderIdAndKind(state.workOrderId, 'FULL');
    await f.repository.listByWorkOrderId(state.workOrderId);

    expect(f.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: state.id, organizationId: state.organizationId },
    });
    expect(f.findFirst).toHaveBeenNthCalledWith(2, {
      where: { workOrderId: state.workOrderId, organizationId: state.organizationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(f.findFirst).toHaveBeenNthCalledWith(3, {
      where: { workOrderId: state.workOrderId, kind: 'FULL', organizationId: state.organizationId },
    });
    expect(f.findMany).toHaveBeenCalledWith({
      where: { workOrderId: state.workOrderId, organizationId: state.organizationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('paginates overdue results without mixing paid or canceled records into the overdue filter', async () => {
    const f = fixture();
    f.findMany.mockResolvedValueOnce([state, { ...state, id: 'next' }]);

    expect(await f.repository.list({ page: 2, limit: 1, now, overdue: true }))
      .toEqual({ items: [state], page: 2, hasMore: true });
    expect(f.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: state.organizationId,
        AND: [{ status: { in: ['OPEN', 'PARTIALLY_PAID'] } }, { dueAt: { lt: now } }],
      }),
      skip: 1,
      take: 2,
    }));

    await f.repository.list({ page: 1, limit: 10, now, overdue: false });

    expect(f.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [{ OR: [{ status: { in: ['PAID', 'CANCELED'] } }, { dueAt: { gte: now } }] }],
      }),
    }));
  });

  it('binds payment identity, request id and pagination to the receivable tenant', async () => {
    const f = fixture();

    await f.repository.findPaymentById(state.id, 'payment');
    await f.repository.findPaymentByRequestId(state.id, 'request');
    await f.repository.createPayment(payment);
    await f.repository.listPayments(state.id, { page: 2, limit: 5 });

    expect(f.findPayment).toHaveBeenNthCalledWith(1, {
      where: { id: 'payment', receivableId: state.id, receivable: { organizationId: state.organizationId } },
    });
    expect(f.findPayment).toHaveBeenNthCalledWith(2, {
      where: { requestId: 'request', receivableId: state.id, receivable: { organizationId: state.organizationId } },
    });

    const { receivableId, ...snapshot } = payment.snapshot();

    expect(f.createPayment).toHaveBeenCalledWith({
      data: { ...snapshot, receivable: { connect: { id: receivableId, organizationId: state.organizationId } } },
    });
    expect(f.listPayments).toHaveBeenCalledWith(expect.objectContaining({
      where: { receivableId, receivable: { organizationId: state.organizationId } },
      skip: 5,
      take: 6,
    }));
  });

  it('rejects incomplete or duplicate reversals and preserves the original payment amount', async () => {
    const f = fixture();
    const reversed = ReceivablePayment.restore(payment.snapshot());

    await expect(f.repository.savePaymentReversal(payment)).rejects.toThrow('INVALID_RECEIVABLE_INPUT');
    expect(f.reversePayment).not.toHaveBeenCalled();

    reversed.reverse('owner', 'Fixture reversal', now);
    await f.repository.savePaymentReversal(reversed);

    expect(f.reversePayment).toHaveBeenCalledWith({
      where: { id: 'payment', receivableId: state.id, reversedAt: null, receivable: { organizationId: state.organizationId } },
      data: { reversedAt: now, reversedById: 'owner', reversalReason: 'Fixture reversal' },
    });

    f.reversePayment.mockResolvedValueOnce({ count: 0 });
    await expect(f.repository.savePaymentReversal(reversed)).rejects.toThrow('PAYMENT_ALREADY_REVERSED');
  });
});
