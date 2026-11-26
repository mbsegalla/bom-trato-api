import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaWorkOrderScheduleRepository } from './prismaWorkOrderSchedule.repository.js';

const now = new Date('2026-01-01T12:00:00Z');
const from = new Date('2026-01-01T00:00:00Z');
const to = new Date('2026-01-02T00:00:00Z');
const row = {
  id: 'order',
  customerId: 'customer',
  customerName: 'Fixture',
  title: 'Fixture service',
  serviceAddress: null,
  assignedToId: 'worker',
  assignedTo: { name: 'Fixture professional' },
  status: 'SCHEDULED',
  scheduledStartAt: new Date('2026-01-01T10:00:00Z'),
  scheduledEndAt: new Date('2026-01-01T14:00:00Z'),
  startedAt: null,
  version: 1,
};

function fixture() {
  const findMany = vi.fn().mockResolvedValue([]);
  const repository = new PrismaWorkOrderScheduleRepository(
    {
      workOrder: { findMany },
    } as unknown as Prisma.TransactionClient,
    'org',
  );

  return { repository, findMany };
}

describe('PrismaWorkOrderScheduleRepository', () => {
  it('filters by overlapping time intervals, tenant and assignee with stable pagination', async () => {
    const f = fixture();
    f.findMany.mockResolvedValueOnce([row, { ...row, id: 'next' }]);

    const result = await f.repository.list({ page: 2, limit: 1, from, to, now, assignedToId: 'worker' });

    expect(result).toMatchObject({
      page: 2,
      hasMore: true,
      items: [{ id: row.id, assignedToName: 'Fixture professional', late: true }],
    });
    expect(f.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          assignedToId: 'worker',
          status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
          scheduledStartAt: { lt: to },
          scheduledEndAt: { gt: from },
        },
        orderBy: [{ scheduledStartAt: 'asc' }, { id: 'asc' }],
        skip: 1,
        take: 2,
      }),
    );
  });

  it('restricts late results to unstarted scheduled work and supports the inverse filter', async () => {
    const f = fixture();
    const lateWhere = { status: 'SCHEDULED', startedAt: null, scheduledStartAt: { lt: now } };

    await f.repository.list({ page: 1, limit: 10, from, to, now, late: true });
    await f.repository.list({ page: 1, limit: 10, from, to, now, late: false });

    expect(f.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ AND: [lateWhere] }),
      }),
    );
    expect(f.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ NOT: lateWhere }),
      }),
    );
  });

  it('does not mark started orders or orders beginning exactly now as late', async () => {
    const f = fixture();
    f.findMany.mockResolvedValueOnce([
      { ...row, status: 'IN_PROGRESS', startedAt: now, assignedTo: null },
      { ...row, id: 'second', scheduledStartAt: now },
    ]);

    const result = await f.repository.list({ page: 1, limit: 10, from, to, now });

    expect(result.items.map((value) => value.late)).toEqual([false, false]);
    expect(result.items[0]?.assignedToName).toBeNull();
  });

  it.each([{ scheduledStartAt: null }, { scheduledEndAt: null }])(
    'rejects incomplete persisted schedules: %j',
    async (override) => {
      const f = fixture();
      f.findMany.mockResolvedValueOnce([{ ...row, ...override }]);

      await expect(f.repository.list({ page: 1, limit: 10, from, to, now })).rejects.toThrow(
        'INVALID_WORK_ORDER_SCHEDULE',
      );
    },
  );
});
