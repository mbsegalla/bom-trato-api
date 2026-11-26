import { describe, expect, it } from 'vitest';

import { WorkOrderChecklistItem } from './workOrderChecklistItem.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
const input = {
  id: 'item',
  organizationId: 'org',
  workOrderId: 'order',
  title: ' Verify ',
  position: 0,
  createdById: 'owner'
};
const create = () => WorkOrderChecklistItem.create(input, now);

describe('WorkOrderChecklistItem', () => {
  it('starts private and incomplete, records completion once and clears evidence on a changed title', () => {
    const item = create();

    expect(item.snapshot()).toMatchObject({
      title: 'Verify',
      visibleInPortal: false,
      completed: false,
      version: 1
    });

    item.update(1, { completed: true }, 'worker', now);
    item.update(2, { visibleInPortal: true }, 'owner', new Date(now.getTime() + 1000));

    expect(item.snapshot()).toMatchObject({
      completedAt: now,
      completedById: 'worker',
      visibleInPortal: true,
      version: 3
    });

    item.update(3, { title: 'New task' }, 'owner', now);

    expect(item.snapshot()).toMatchObject({
      title: 'New task',
      completed: false,
      completedAt: null,
      completedById: null,
      version: 4
    });
  });

  it('rejects stale writes, completion with a changed title and version overflow', () => {
    const item = create();

    expect(() => item.update(0, { completed: true }, 'worker', now)).toThrow('WORK_ORDER_CHECKLIST_VERSION_CONFLICT');
    expect(() => item.update(1, { title: 'New', completed: true }, 'worker', now)).toThrow('INVALID_WORK_ORDER_CHECKLIST_INPUT');

    const max = WorkOrderChecklistItem.restore({ ...item.snapshot(), version: 2147483647 });

    expect(() => max.update(2147483647, { completed: true }, 'worker', now)).toThrow('WORK_ORDER_CHECKLIST_VERSION_CONFLICT');
    expect(item.snapshot().version).toBe(1);
  });

  it('does not change the version on a no-op reorder and enforces capacity and position', () => {
    const item = create();
    item.move(1, 0, 'owner', now);

    expect(item.snapshot().version).toBe(1);

    item.move(1, 5, 'owner', now);

    expect(item.snapshot()).toMatchObject({ position: 5, version: 2 });
    expect(() => item.move(2, -1, 'owner', now)).toThrow('INVALID_WORK_ORDER_CHECKLIST_INPUT');
    expect(() => WorkOrderChecklistItem.assertCapacity(49)).not.toThrow();
    expect(() => WorkOrderChecklistItem.assertCapacity(50)).toThrow('WORK_ORDER_CHECKLIST_LIMIT_REACHED');
  });
});
