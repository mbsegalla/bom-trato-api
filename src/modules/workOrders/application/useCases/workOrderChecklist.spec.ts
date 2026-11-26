import { describe, expect, it, vi } from 'vitest';

import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type {
  UpdateWorkOrderChecklistItemInput,
  WorkOrderChecklistItem,
  WorkOrderChecklistItemProps,
} from '../../domain/entities/workOrderChecklistItem.entity.js';
import { WorkOrderChecklistError } from '../../domain/errors/workOrderChecklist.error.js';
import { WorkOrderChecklistRepository } from '../../domain/repositories/workOrderChecklist.repository.js';
import type { WorkOrderChecklistUnitOfWork } from '../ports/workOrderChecklistUnitOfWork.port.js';
import { WorkOrderChecklistApplicationService } from '../services/workOrderChecklistApplicationService.service.js';

import { CreateWorkOrderChecklistItemUseCase } from './createWorkOrderChecklistItem.useCase.js';
import { DeleteWorkOrderChecklistItemUseCase } from './deleteWorkOrderChecklistItem.useCase.js';
import { ListWorkOrderChecklistUseCase } from './listWorkOrderChecklist.useCase.js';
import { ReorderWorkOrderChecklistUseCase } from './reorderWorkOrderChecklist.useCase.js';
import { UpdateWorkOrderChecklistItemUseCase } from './updateWorkOrderChecklistItem.useCase.js';

const params = {
  organizationId: 'organization',
  workOrderId: 'work-order',
  userId: 'member',
};
const changeParams = { ...params, itemId: 'first', version: 1 };
const createdAt = new Date('2026-11-25T12:00:00.000Z');
const completedAt = new Date('2026-11-25T13:00:00.000Z');

function makeItem(overrides: Partial<WorkOrderChecklistItemProps> = {}): WorkOrderChecklistItemProps {
  return {
    id: 'first',
    organizationId: params.organizationId,
    workOrderId: params.workOrderId,
    title: 'Verificar a instalação',
    position: 0,
    completed: false,
    completedAt: null,
    completedById: null,
    visibleInPortal: false,
    version: 1,
    createdById: params.userId,
    updatedById: params.userId,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

class MemoryChecklistRepository extends WorkOrderChecklistRepository {
  items: WorkOrderChecklistItemProps[] = [];
  saves = 0;

  async list(): Promise<WorkOrderChecklistItemProps[]> {
    return structuredClone(this.items).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  }

  async findById(id: string): Promise<WorkOrderChecklistItemProps | null> {
    return structuredClone(this.items.find((item) => item.id === id) ?? null);
  }

  async create(item: WorkOrderChecklistItem): Promise<void> {
    this.items.push(item.snapshot());
  }

  async save(item: WorkOrderChecklistItem, expectedVersion: number): Promise<void> {
    const state = item.snapshot();
    const index = this.items.findIndex((stored) => stored.id === state.id && stored.version === expectedVersion);

    if (index === -1) {
      throw new WorkOrderChecklistError('WORK_ORDER_CHECKLIST_VERSION_CONFLICT');
    }

    this.items[index] = state;
    this.saves += 1;
  }

  async delete(id: string, expectedVersion: number): Promise<void> {
    const index = this.items.findIndex((item) => item.id === id && item.version === expectedVersion);

    if (index === -1) {
      throw new WorkOrderChecklistError('WORK_ORDER_CHECKLIST_VERSION_CONFLICT');
    }

    this.items.splice(index, 1);
  }
}

function setup(initial: WorkOrderChecklistItemProps[] = []) {
  const checklist = new MemoryChecklistRepository();
  checklist.items = structuredClone(initial);
  const access: OrganizationAccessContext = {
    isMember: true,
    verified: true,
    hasPlatformAccess: true,
    source: 'SUBSCRIPTION',
    billingNeedsReconciliation: false,
  };
  const context = (actor: typeof params) => ({
    access: { ...access, isMember: access.isMember && actor.organizationId === params.organizationId },
    checklist,
    workOrderExists: async () => actor.workOrderId === params.workOrderId,
  });
  const unitOfWork: WorkOrderChecklistUnitOfWork = {
    read: async (actor, operation) => operation(context(actor)),
    run: async (actor, operation) => operation(context(actor)),
  };
  const processor = new WorkOrderChecklistApplicationService(unitOfWork);

  return {
    checklist,
    access,
    unitOfWork,
    list: new ListWorkOrderChecklistUseCase(processor),
    create: new CreateWorkOrderChecklistItemUseCase(processor),
    update: new UpdateWorkOrderChecklistItemUseCase(processor),
    delete: new DeleteWorkOrderChecklistItemUseCase(processor),
    reorder: new ReorderWorkOrderChecklistUseCase(processor),
  };
}

describe('work order checklist items', () => {
  it('creates private, incomplete items with trimmed titles and independent versions', async () => {
    const fixture = setup();

    const result = await fixture.create.execute(params, { title: '  Verificar a instalação  ' });

    expect(result).toMatchObject({
      title: 'Verificar a instalação',
      position: 0,
      completed: false,
      completedAt: null,
      completedById: null,
      visibleInPortal: false,
      version: 1,
    });
    expect(result).not.toHaveProperty('organizationId');
    expect(result).not.toHaveProperty('workOrderId');
    expect(result).not.toHaveProperty('createdById');
    expect(fixture.checklist.items[0]).toMatchObject({ createdById: params.userId, updatedById: params.userId });
    await expect(fixture.list.execute(params)).resolves.toEqual({
      items: [result],
      progress: { total: 1, completed: 0 },
    });
  });

  it.each(['', '   ', 'x'.repeat(201)])('rejects an invalid title without persisting an item', async (title) => {
    const fixture = setup();

    await expect(fixture.create.execute(params, { title })).rejects.toMatchObject({
      code: 'INVALID_WORK_ORDER_CHECKLIST_INPUT',
    });
    expect(fixture.checklist.items).toEqual([]);
  });

  it('accepts the maximum title length and appends after gaps left by deletion', async () => {
    const fixture = setup([makeItem({ position: 4 })]);

    const result = await fixture.create.execute(params, { title: 'x'.repeat(200) });

    expect(result.title).toHaveLength(200);
    expect(result.position).toBe(5);
    expect(fixture.checklist.items[0].version).toBe(1);
  });

  it('allows the fiftieth item and rejects the next item inside the write operation', async () => {
    const fixture = setup(Array.from({ length: 49 }, (_, index) => makeItem({ id: String(index), position: index })));

    await expect(fixture.create.execute(params, { title: 'Último item' })).resolves.toMatchObject({ position: 49 });
    await expect(fixture.create.execute(params, { title: 'Excedente' })).rejects.toMatchObject({
      code: 'WORK_ORDER_CHECKLIST_LIMIT_REACHED',
    });
    expect(fixture.checklist.items).toHaveLength(50);
  });

  it('uses the authenticated actor for completion and preserves attribution on repeated completion', async () => {
    const fixture = setup([makeItem()]);

    const result = await fixture.update.execute({ ...changeParams, userId: 'technician' }, { completed: true });

    expect(result).toMatchObject({
      completed: true,
      completedById: 'technician',
      version: 2,
    });
    expect(result.completedAt).toBeInstanceOf(Date);

    const repeated = await fixture.update.execute(
      { ...changeParams, version: 2, userId: 'another-member' },
      {
        title: ' Verificar a instalação ',
        completed: true,
        visibleInPortal: true,
      },
    );

    expect(repeated.completedAt).toEqual(result.completedAt);
    expect(repeated.completedById).toBe('technician');
    expect(fixture.checklist.items[0].updatedById).toBe('another-member');
    await expect(fixture.list.execute(params)).resolves.toMatchObject({ progress: { total: 1, completed: 1 } });
  });

  it.each([{ completed: false }, { title: 'Verificar outro componente' }])(
    'clears completion and attribution when reopening or renaming',
    async (input) => {
      const fixture = setup([makeItem({ completed: true, completedAt, completedById: 'technician' })]);

      const reopened = await fixture.update.execute(changeParams, input);

      expect(reopened).toMatchObject({
        completed: false,
        completedAt: null,
        completedById: null,
        version: 2,
      });

      const completed = await fixture.update.execute(
        { ...changeParams, version: 2, userId: 'new-technician' },
        { completed: true },
      );

      expect(completed).toMatchObject({
        completed: true,
        completedById: 'new-technician',
      });
      expect(completed.completedAt).toBeInstanceOf(Date);
    },
  );

  it.each([false, true])(
    'rejects changing a title and marking it complete together (completed=%s)',
    async (completed) => {
      const initial = makeItem({
        completed,
        completedAt: completed ? completedAt : null,
        completedById: completed ? 'technician' : null,
      });
      const fixture = setup([initial]);

      await expect(
        fixture.update.execute(changeParams, { title: 'Uma tarefa diferente', completed: true }),
      ).rejects.toMatchObject({ code: 'INVALID_WORK_ORDER_CHECKLIST_INPUT' });
      expect(fixture.checklist.items).toEqual([initial]);
    },
  );

  it.each([{}, { title: '' }, { completed: null }, { visibleInPortal: null }])(
    'rejects empty or invalid updates without changing the item',
    async (input) => {
      const fixture = setup([makeItem()]);

      await expect(
        fixture.update.execute(changeParams, input as UpdateWorkOrderChecklistItemInput),
      ).rejects.toMatchObject({
        code: 'INVALID_WORK_ORDER_CHECKLIST_INPUT',
      });
      expect(fixture.checklist.items).toEqual([makeItem()]);
    },
  );

  it('keeps survivor positions and versions when deleting an item', async () => {
    const survivor = makeItem({ id: 'second', position: 1, version: 4 });
    const fixture = setup([makeItem(), survivor]);

    await fixture.delete.execute(changeParams);

    expect(fixture.checklist.items).toEqual([survivor]);
  });

  it('rejects stale updates and deletes without changing the item', async () => {
    const fixture = setup([makeItem({ version: 2 })]);

    await expect(fixture.update.execute(changeParams, { completed: true })).rejects.toMatchObject({
      code: 'WORK_ORDER_CHECKLIST_VERSION_CONFLICT',
    });
    await expect(fixture.delete.execute(changeParams)).rejects.toMatchObject({
      code: 'WORK_ORDER_CHECKLIST_VERSION_CONFLICT',
    });
    expect(fixture.checklist.items).toEqual([makeItem({ version: 2 })]);
  });

  it('rejects unknown items and exhausted versions', async () => {
    const fixture = setup([makeItem({ version: 2147483647 })]);

    await expect(
      fixture.update.execute({ ...changeParams, itemId: 'missing' }, { completed: true }),
    ).rejects.toMatchObject({
      code: 'WORK_ORDER_CHECKLIST_ITEM_NOT_FOUND',
    });
    await expect(fixture.delete.execute({ ...changeParams, itemId: 'missing' })).rejects.toMatchObject({
      code: 'WORK_ORDER_CHECKLIST_ITEM_NOT_FOUND',
    });
    await expect(
      fixture.update.execute({ ...changeParams, version: 2147483647 }, { completed: true }),
    ).rejects.toMatchObject({ code: 'WORK_ORDER_CHECKLIST_VERSION_CONFLICT' });
  });
});

describe('work order checklist access', () => {
  it.each([
    ['isMember', 'MEMBER_REQUIRED'],
    ['verified', 'VERIFIED_USER_REQUIRED'],
  ] as const)('requires %s for reads and every mutation', async (field, code) => {
    const fixture = setup([makeItem()]);
    fixture.access[field] = false;

    for (const action of [
      () => fixture.list.execute(params),
      () => fixture.create.execute(params, { title: 'Inspecionar' }),
      () => fixture.update.execute(changeParams, { visibleInPortal: false }),
      () => fixture.delete.execute(changeParams),
      () => fixture.reorder.execute(params, { items: [{ id: 'first', version: 1 }] }),
    ]) {
      await expect(action()).rejects.toMatchObject({ code });
    }

    expect(fixture.checklist.items).toEqual([makeItem()]);
  });

  it('rejects a different organization or work order before reading checklist data', async () => {
    const fixture = setup([makeItem()]);
    const list = vi.spyOn(fixture.checklist, 'list');

    await expect(fixture.list.execute({ ...params, organizationId: 'other' })).rejects.toMatchObject({
      code: 'MEMBER_REQUIRED',
    });
    await expect(fixture.list.execute({ ...params, workOrderId: 'other' })).rejects.toMatchObject({
      code: 'WORK_ORDER_NOT_FOUND',
    });
    expect(list).not.toHaveBeenCalled();
  });

  it.each(['expired', 'reconciliation'] as const)(
    'allows read, hide and deletion when platform access is %s but rejects operational writes',
    async (scenario) => {
      const fixture = setup([
        makeItem({
          visibleInPortal: true,
          completed: true,
          completedAt,
          completedById: 'technician',
        }),
      ]);
      fixture.access.hasPlatformAccess = scenario !== 'expired';
      fixture.access.billingNeedsReconciliation = scenario === 'reconciliation';
      const code = scenario === 'expired' ? 'SUBSCRIPTION_REQUIRED' : 'BILLING_RECONCILIATION_REQUIRED';

      await expect(fixture.list.execute(params)).resolves.toMatchObject({ progress: { total: 1, completed: 1 } });

      for (const action of [
        () => fixture.create.execute(params, { title: 'Inspecionar' }),
        () => fixture.update.execute(changeParams, { completed: false }),
        () => fixture.update.execute(changeParams, { title: 'Mudar tarefa' }),
        () => fixture.update.execute(changeParams, { visibleInPortal: true }),
        () => fixture.update.execute(changeParams, { visibleInPortal: false, title: 'Mudar tarefa' }),
        () => fixture.update.execute(changeParams, { visibleInPortal: false, completed: false }),
        () => fixture.reorder.execute(params, { items: [{ id: 'first', version: 1 }] }),
      ]) {
        await expect(action()).rejects.toMatchObject({ code });
      }

      await expect(
        fixture.update.execute(changeParams, {
          title: ' Verificar a instalação ',
          completed: true,
          visibleInPortal: false,
        }),
      ).resolves.toMatchObject({
        visibleInPortal: false,
        completedAt,
        completedById: 'technician',
        version: 2,
      });

      await fixture.delete.execute({ ...changeParams, version: 2 });

      expect(fixture.checklist.items).toEqual([]);
    },
  );
});

describe('work order checklist ordering', () => {
  const first = makeItem();
  const second = makeItem({ id: 'second', position: 1 });
  const third = makeItem({ id: 'third', position: 2 });

  it('returns the new order and only increments the versions of moved items', async () => {
    const fixture = setup([first, second, third]);

    const result = await fixture.reorder.execute(params, {
      items: [
        { id: 'third', version: 1 },
        { id: 'second', version: 1 },
        { id: 'first', version: 1 },
      ],
    });

    expect(result.items.map(({ id, position, version }) => ({ id, position, version }))).toEqual([
      { id: 'third', position: 0, version: 2 },
      { id: 'second', position: 1, version: 1 },
      { id: 'first', position: 2, version: 2 },
    ]);
    expect(result.progress).toEqual({ total: 3, completed: 0 });
    expect(fixture.checklist.saves).toBe(2);
  });

  it('accepts an empty current checklist without creating or saving items', async () => {
    const fixture = setup();

    await expect(fixture.reorder.execute(params, { items: [] })).resolves.toEqual({
      items: [],
      progress: { total: 0, completed: 0 },
    });
    expect(fixture.checklist.saves).toBe(0);
  });

  it.each([
    [{ id: 'first', version: 1 }],
    [
      { id: 'first', version: 1 },
      { id: 'first', version: 1 },
    ],
    [
      { id: 'first', version: 1 },
      { id: 'foreign', version: 1 },
    ],
    [
      { id: 'first', version: 1 },
      { id: 'second', version: 1 },
      { id: 'third', version: 1 },
    ],
    [
      { id: 'second', version: 1 },
      { id: 'first', version: 2 },
    ],
  ])('rejects an incomplete, duplicate, foreign or stale snapshot before saving any item', async (...items) => {
    const fixture = setup([first, second]);

    await expect(fixture.reorder.execute(params, { items })).rejects.toMatchObject({
      code: 'WORK_ORDER_CHECKLIST_VERSION_CONFLICT',
    });
    expect(fixture.checklist.items).toEqual([first, second]);
    expect(fixture.checklist.saves).toBe(0);
  });

  it.each(['created', 'deleted'] as const)('rejects a snapshot taken before an item was %s', async (scenario) => {
    const fixture = setup([first, second]);
    const input = {
      items: [
        { id: 'second', version: 1 },
        { id: 'first', version: 1 },
      ],
    };

    if (scenario === 'created') {
      await fixture.create.execute(params, { title: 'Outra tarefa' });
    } else {
      await fixture.delete.execute(changeParams);
    }

    const current = structuredClone(fixture.checklist.items);

    await expect(fixture.reorder.execute(params, input)).rejects.toMatchObject({
      code: 'WORK_ORDER_CHECKLIST_VERSION_CONFLICT',
    });
    expect(fixture.checklist.items).toEqual(current);
    expect(fixture.checklist.saves).toBe(0);
  });

  it('validates exhausted versions for the entire order before persisting the first move', async () => {
    const fixture = setup([{ ...first, version: 2147483647 }, second]);

    await expect(
      fixture.reorder.execute(params, {
        items: [
          { id: 'second', version: 1 },
          { id: 'first', version: 2147483647 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'WORK_ORDER_CHECKLIST_VERSION_CONFLICT' });
    expect(fixture.checklist.saves).toBe(0);
  });
});
