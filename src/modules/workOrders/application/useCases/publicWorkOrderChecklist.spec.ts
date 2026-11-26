import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { ObjectStorage } from '../../../../shared/storage/objectStorage.port.js';
import type { WorkOrderChecklistItemProps } from '../../domain/entities/workOrderChecklistItem.entity.js';
import type { WorkOrderShareProps } from '../../domain/entities/workOrderShare.entity.js';
import { NodeWorkOrderShareSecurity } from '../../infrastructure/security/nodeWorkOrderShareSecurity.js';
import { PrismaPublicWorkOrderUnitOfWork } from '../../infrastructure/transactions/prismaPublicWorkOrderUnitOfWork.js';

import { GetPublicWorkOrderUseCase } from './getPublicWorkOrder.useCase.js';

function setup() {
  const security = new NodeWorkOrderShareSecurity();
  const token = 'a'.repeat(64);
  const share: WorkOrderShareProps = {
    id: 'share',
    organizationId: 'organization',
    workOrderId: 'work-order',
    tokenHash: security.hash(token),
    createdById: 'member',
    createdAt: new Date(Date.now() - 10000),
    expiresAt: new Date(Date.now() + 60000),
    revokedAt: null,
  };
  const items: WorkOrderChecklistItemProps[] = Array.from({ length: 4 }, (_, position) => ({
    id: String(position),
    organizationId: share.organizationId,
    workOrderId: share.workOrderId,
    title: position % 2 === 0 ? 'Tarefa interna' : 'Tarefa compartilhada',
    position,
    completed: position !== 3,
    completedAt: position === 3 ? null : new Date(),
    completedById: position === 3 ? null : 'technician',
    visibleInPortal: position % 2 !== 0,
    version: 7,
    createdById: 'member',
    updatedById: 'technician',
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  const workOrder = {
    id: share.workOrderId,
    organizationId: share.organizationId,
    version: 1,
    title: 'Manutenção',
    status: 'IN_PROGRESS' as const,
    currency: 'BRL',
    subtotalInCents: 10000,
    discountInCents: 0,
    totalInCents: 10000,
    assignedToId: null,
    scheduledStartAt: null,
    scheduledEndAt: null,
    startedAt: new Date(),
    completedAt: null,
    canceledAt: null,
    createdAt: new Date(Date.now() - 10000),
    organization: { name: 'Bom Trato', logoKey: null },
    quote: { quoteStatusHistories: [] },
    workOrderItems: [],
    workOrderStatusHistory: [],
    workOrderScheduleHistories: [],
    workOrderPhotos: [],
    receivables: [],
  };
  const findWorkOrder = vi.fn(async (args: Prisma.WorkOrderFindFirstArgs) => {
    const select = args.select?.workOrderChecklistItems;
    const visibleOnly = typeof select === 'object' && select.where?.visibleInPortal === true;

    return {
      ...workOrder,
      // Preserve extra fields in the fake row to also exercise the mapper's
      // whitelist if an adapter accidentally returns more than the projection.
      workOrderChecklistItems: items.filter((item) => !visibleOnly || item.visibleInPortal),
    };
  });
  const db = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    workOrderShare: { findUnique: vi.fn(async () => structuredClone(share)) },
    workOrder: { findFirst: findWorkOrder },
  };
  const prisma = {
    $transaction: async <T>(operation: (client: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
      operation(db as unknown as Prisma.TransactionClient),
  } as unknown as PrismaService;
  const storage: ObjectStorage = {
    put: async () => undefined,
    delete: async () => undefined,
    publicUrl: () => 'https://example.com/logo',
  };
  const useCase = new GetPublicWorkOrderUseCase(new PrismaPublicWorkOrderUnitOfWork(prisma), security, storage);

  return {
    items,
    share,
    workOrder,
    findWorkOrder,
    useCase,
    token,
  };
}

describe('public work order checklist projection', () => {
  it('filters private items in the scoped query and exposes only public fields and visible progress', async () => {
    const fixture = setup();

    const result = await fixture.useCase.execute(fixture.token);

    const query = fixture.findWorkOrder.mock.calls[0][0];

    expect(query.where).toEqual({ id: 'work-order', organizationId: 'organization' });
    expect(query.select?.workOrderChecklistItems).toEqual({
      where: { visibleInPortal: true },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        completed: true,
        completedAt: true,
      },
    });
    expect(result.checklist).toEqual({
      items: [1, 3].map((index) => ({
        id: String(index),
        title: 'Tarefa compartilhada',
        completed: fixture.items[index].completed,
        completedAt: fixture.items[index].completedAt,
      })),
      progress: { total: 2, completed: 1 },
    });
    expect(result).not.toHaveProperty('checklistItems');
    expect(Object.keys(result.checklist.items[0]).sort()).toEqual(['completed', 'completedAt', 'id', 'title']);
    expect(JSON.stringify(result)).not.toContain('Tarefa interna');
    expect(JSON.stringify(result.checklist)).not.toContain('technician');
  });

  it('returns empty visible progress when all items are private', async () => {
    const fixture = setup();
    fixture.items.forEach((item) => {
      item.visibleInPortal = false;
    });

    await expect(fixture.useCase.execute(fixture.token)).resolves.toMatchObject({
      checklist: { items: [], progress: { total: 0, completed: 0 } },
    });
  });

  it.each(['revoked', 'expired'] as const)('does not read checklist data for a %s share', async (scenario) => {
    const fixture = setup();

    if (scenario === 'revoked') {
      fixture.share.revokedAt = new Date();
    } else {
      fixture.share.expiresAt = new Date(Date.now() - 1);
    }

    await expect(fixture.useCase.execute(fixture.token)).rejects.toMatchObject({ code: 'WORK_ORDER_SHARE_NOT_FOUND' });

    expect(fixture.findWorkOrder).not.toHaveBeenCalled();
  });

  it.each(['organizationId', 'id'] as const)(
    'rejects a share that does not match the resolved work order %s',
    async (field) => {
      const fixture = setup();
      fixture.workOrder[field] = 'different';

      await expect(fixture.useCase.execute(fixture.token)).rejects.toMatchObject({
        code: 'WORK_ORDER_SHARE_NOT_FOUND',
      });
    },
  );
});
