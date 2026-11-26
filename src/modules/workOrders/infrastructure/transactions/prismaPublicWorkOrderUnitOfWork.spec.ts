import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

import { PrismaPublicWorkOrderUnitOfWork } from './prismaPublicWorkOrderUnitOfWork.js';

const now = new Date('2026-01-01T00:00:00Z');
const share = { id: 'share', organizationId: 'org', workOrderId: 'order', tokenHash: 'hash' };
const order = {
  id: 'order',
  organizationId: 'org',
  assignedToId: 'user',
  title: 'Fixture',
  workOrderItems: [{ name: 'Service' }],
  workOrderPhotos: [{ id: 'photo' }],
  workOrderChecklistItems: [{ id: 'check' }],
  workOrderStatusHistory: [{ version: 1 }],
  workOrderScheduleHistories: [],
  quote: { quoteStatusHistories: [{ createdAt: now }] },
};

function fixture() {
  const source = vi.fn().mockResolvedValue({ organizationId: 'org' });
  const findShare = vi.fn().mockResolvedValue(share);
  const findOrder = vi.fn().mockResolvedValue(order);
  const findPhoto = vi.fn().mockResolvedValue(null);
  const member = vi.fn().mockResolvedValue({ user: { name: 'Fixture user', disabledAt: null, emailVerifiedAt: now } });
  const organization = vi.fn().mockResolvedValue({ subscriptions: [], trial: null });
  const query = vi.fn().mockResolvedValue([{ id: 'org' }]);
  const db = {
    workOrderShare: { findUnique: findShare },
    workOrder: { findFirst: findOrder },
    workOrderPhoto: { findFirst: findPhoto },
    organizationMember: { findUnique: member },
    organization: { findUnique: organization },
    $queryRaw: query,
    $executeRaw: vi.fn().mockResolvedValue(0),
  };
  const transaction = vi.fn(async (operation: (client: typeof db) => Promise<unknown>) => operation(db));
  const unit = new PrismaPublicWorkOrderUnitOfWork({
    workOrderShare: { findUnique: source },
    $transaction: transaction,
  } as unknown as PrismaService);

  return { unit, source, findShare, findOrder, findPhoto, member, organization, query, transaction };
}

describe('PrismaPublicWorkOrderUnitOfWork', () => {
  it('reads the hashed share inside a read-only transaction', async () => {
    const f = fixture();
    expect(await f.unit.read('hash', async (tx) => tx.share)).toEqual(share);
    expect(f.source).not.toHaveBeenCalled();
    expect(f.findShare).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: 'hash' } }));
    expect(f.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'RepeatableRead' }),
    );
  });

  it('rejects missing public shares on reads', async () => {
    const f = fixture();
    f.findShare.mockResolvedValue(null);
    const operation = vi.fn();
    await expect(f.unit.read('missing', operation)).rejects.toThrow('WORK_ORDER_SHARE_NOT_FOUND');
    expect(operation).not.toHaveBeenCalled();
  });

  it('rejects unknown write tokens before opening a transaction', async () => {
    const f = fixture();
    f.source.mockResolvedValue(null);
    await expect(f.unit.run('missing', vi.fn())).rejects.toThrow('WORK_ORDER_SHARE_NOT_FOUND');
    expect(f.transaction).not.toHaveBeenCalled();
  });

  it.each([null, { ...share, organizationId: 'foreign' }])(
    'revalidates share identity under the organization lock',
    async (current) => {
      const f = fixture();
      f.findShare.mockResolvedValue(current);
      const operation = vi.fn();
      await expect(f.unit.run('hash', operation)).rejects.toThrow('WORK_ORDER_SHARE_NOT_FOUND');
      expect(operation).not.toHaveBeenCalled();
      expect(f.query.mock.calls[0]![0].join(' ')).toContain('FOR UPDATE');
    },
  );

  it('rejects a removed organization without exposing its existence', async () => {
    const f = fixture();
    f.query.mockResolvedValue([]);
    await expect(f.unit.run('hash', vi.fn())).rejects.toThrow('WORK_ORDER_SHARE_NOT_FOUND');
    expect(f.findShare).not.toHaveBeenCalled();
  });

  it('maps public order details without returning the internal assignee identifier', async () => {
    const f = fixture();
    const result = await f.unit.read('hash', (tx) => tx.findWorkOrder());
    expect(result).toMatchObject({
      id: 'order',
      assignedToName: 'Fixture user',
      items: order.workOrderItems,
      photos: order.workOrderPhotos,
      checklistItems: order.workOrderChecklistItems,
      timelineSource: { quoteApprovedAt: now, statusHistory: order.workOrderStatusHistory, scheduleHistory: [] },
    });
    expect(result).not.toHaveProperty('assignedToId');
    expect(f.findOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order', organizationId: 'org' },
        select: expect.objectContaining({
          workOrderPhotos: expect.objectContaining({ where: { visibleInPortal: true } }),
          workOrderChecklistItems: expect.objectContaining({ where: { visibleInPortal: true } }),
        }),
      }),
    );
  });

  it('returns null for an order that is no longer available', async () => {
    const f = fixture();
    f.findOrder.mockResolvedValue(null);
    expect(await f.unit.read('hash', (tx) => tx.findWorkOrder())).toBeNull();
    expect(f.member).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { user: { name: 'Disabled', disabledAt: now, emailVerifiedAt: now } },
    { user: { name: 'Unverified', disabledAt: null, emailVerifiedAt: null } },
  ])('hides an unavailable or ineligible responsible user', async (member) => {
    const f = fixture();
    f.member.mockResolvedValue(member);
    expect(await f.unit.read('hash', (tx) => tx.findWorkOrder())).toMatchObject({ assignedToName: null });
    expect(f.member).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_userId: { organizationId: 'org', userId: 'user' } },
      }),
    );
  });

  it('does not query membership when no user is assigned', async () => {
    const f = fixture();
    f.findOrder.mockResolvedValue({ ...order, assignedToId: null, quote: { quoteStatusHistories: [] } });
    expect(await f.unit.read('hash', (tx) => tx.findWorkOrder())).toMatchObject({
      assignedToName: null,
      timelineSource: { quoteApprovedAt: null },
    });
    expect(f.member).not.toHaveBeenCalled();
  });

  it('scopes photo retrieval to visible photos from the shared order and organization', async () => {
    const f = fixture();
    await f.unit.read('hash', (tx) => tx.findPhoto('photo'));
    expect(f.findPhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'photo', organizationId: 'org', workOrderId: 'order', visibleInPortal: true },
      }),
    );
  });

  it('resolves current platform access from the share organization', async () => {
    const f = fixture();
    expect(await f.unit.read('hash', (tx) => tx.findPlatformAccess())).toMatchObject({
      hasAccess: false,
      source: 'NONE',
    });
    expect(f.organization).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'org' } }));
  });
});
