import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { WorkOrderShare } from '../../domain/entities/workOrderShare.entity.js';
import { PrismaWorkOrderShareRepository } from './prismaWorkOrderShare.repository.js';

const now = new Date('2026-01-01T12:00:00Z');
const share = WorkOrderShare.create({
  id: 'share',
  organizationId: 'org',
  workOrderId: 'order',
  tokenHash: 'a'.repeat(64),
  userId: 'owner',
  expiresAt: new Date(now.getTime() + 3600000),
}, now);
const state = share.snapshot();

function fixture() {
  const findFirst = vi.fn().mockResolvedValue(null);
  const create = vi.fn().mockResolvedValue(undefined);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const repository = new PrismaWorkOrderShareRepository({
    workOrderShare: { findFirst, create, updateMany },
  } as unknown as Prisma.TransactionClient, state.organizationId);

  return { repository, findFirst, create, updateMany };
}

describe('PrismaWorkOrderShareRepository', () => {
  it('requires the current active identity, valid time window and tenant for a share read', async () => {
    const f = fixture();

    await f.repository.findByHash(state.tokenHash);
    await f.repository.findCurrent(state.workOrderId, now);

    expect(f.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { organizationId: state.organizationId, tokenHash: state.tokenHash },
    }));
    expect(f.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: {
        organizationId: state.organizationId,
        workOrderId: state.workOrderId,
        activeWorkOrderId: state.workOrderId,
        revokedAt: null,
        createdAt: { lte: now },
        expiresAt: { gt: now },
      },
    }));
  });

  it('never persists foreign or already revoked shares', async () => {
    const f = fixture();

    await expect(f.repository.create(WorkOrderShare.restore({ ...state, organizationId: 'other' })))
      .rejects.toThrow('WORK_ORDER_SHARE_NOT_FOUND');
    await expect(f.repository.create(WorkOrderShare.restore({ ...state, revokedAt: now })))
      .rejects.toThrow('WORK_ORDER_SHARE_NOT_FOUND');

    expect(f.create).not.toHaveBeenCalled();
  });

  it('assigns the active identity on create and releases it on revocation', async () => {
    const f = fixture();

    await f.repository.create(share);
    await f.repository.revokeForWorkOrder(state.workOrderId, now);

    expect(f.create).toHaveBeenCalledWith({ data: { ...state, activeWorkOrderId: state.workOrderId } });
    expect(f.updateMany).toHaveBeenCalledWith({
      where: { organizationId: state.organizationId, workOrderId: state.workOrderId, revokedAt: null },
      data: { activeWorkOrderId: null, revokedAt: now },
    });
  });
});
