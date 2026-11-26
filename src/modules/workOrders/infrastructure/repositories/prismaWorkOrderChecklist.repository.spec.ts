import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { WorkOrderChecklistItem } from '../../domain/entities/workOrderChecklistItem.entity.js';
import { PrismaWorkOrderChecklistRepository, workOrderChecklistItemSelect } from './prismaWorkOrderChecklist.repository.js';

const scope = { organizationId: 'org', workOrderId: 'order' };
const now = new Date('2026-01-01T12:00:00Z');
const item = WorkOrderChecklistItem.create({
  ...scope,
  id: 'item',
  title: 'Fixture task',
  position: 0,
  createdById: 'owner',
}, now);

function fixture() {
  const findMany = vi.fn().mockResolvedValue([]);
  const findFirst = vi.fn().mockResolvedValue(null);
  const create = vi.fn().mockResolvedValue(undefined);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const repository = new PrismaWorkOrderChecklistRepository({
    workOrderChecklistItem: { findMany, findFirst, create, updateMany, deleteMany },
  } as unknown as Prisma.TransactionClient, scope.organizationId, scope.workOrderId);

  return { repository, findMany, findFirst, create, updateMany, deleteMany };
}

describe('PrismaWorkOrderChecklistRepository', () => {
  it('scopes ordered checklist reads by organization and work order', async () => {
    const f = fixture();

    await f.repository.list();
    await f.repository.findById('item');

    expect(f.findMany).toHaveBeenCalledWith({
      where: scope,
      select: workOrderChecklistItemSelect,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    expect(f.findFirst).toHaveBeenCalledWith({
      where: { ...scope, id: 'item' }, select: workOrderChecklistItemSelect,
    });
  });

  it.each([{ organizationId: 'other' }, { workOrderId: 'other' }])(
    'rejects writes that cross the checklist scope: %j',
    async (override) => {
      const f = fixture();
      const foreign = WorkOrderChecklistItem.restore({ ...item.snapshot(), ...override });

      await expect(f.repository.create(foreign)).rejects.toThrow('WORK_ORDER_CHECKLIST_ITEM_NOT_FOUND');
      await expect(f.repository.save(foreign, 1)).rejects.toThrow('WORK_ORDER_CHECKLIST_ITEM_NOT_FOUND');

      expect(f.create).not.toHaveBeenCalled();
      expect(f.updateMany).not.toHaveBeenCalled();
    },
  );

  it('persists completion, visibility and actor identity together with optimistic version guards', async () => {
    const f = fixture();
    const updated = WorkOrderChecklistItem.restore(item.snapshot());

    await f.repository.create(updated);
    updated.update(1, { completed: true, visibleInPortal: true }, 'worker', now);
    await f.repository.save(updated, 1);
    await f.repository.delete('item', 2);

    expect(f.create).toHaveBeenCalledWith({ data: item.snapshot() });
    expect(f.updateMany).toHaveBeenCalledWith({
      where: { ...scope, id: 'item', version: 1 },
      data: expect.objectContaining({
        completed: true,
        completedAt: now,
        completedById: 'worker',
        visibleInPortal: true,
        version: 2,
        updatedById: 'worker',
      }),
    });
    expect(f.deleteMany).toHaveBeenCalledWith({ where: { ...scope, id: 'item', version: 2 } });
  });

  it('reports stale writes and deletes rather than assuming the change succeeded', async () => {
    const f = fixture();
    f.updateMany.mockResolvedValueOnce({ count: 0 });
    f.deleteMany.mockResolvedValueOnce({ count: 0 });

    await expect(f.repository.save(item, 1)).rejects.toThrow('WORK_ORDER_CHECKLIST_VERSION_CONFLICT');
    await expect(f.repository.delete('item', 1)).rejects.toThrow('WORK_ORDER_CHECKLIST_VERSION_CONFLICT');
  });
});
