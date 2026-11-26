import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PrismaWorkOrderAcceptanceUnitOfWork } from './prismaWorkOrderAcceptanceUnitOfWork.js';

const params = { organizationId: 'org', userId: 'owner', workOrderId: 'order' };

function fixture() {
  const organization = vi.fn().mockResolvedValue({ id: 'org' });
  const member = vi.fn().mockResolvedValue(null);
  const workOrder = vi.fn().mockResolvedValue(null);
  const query = vi.fn().mockResolvedValue([{ id: 'org' }]);
  const db = {
    organization: { findUnique: organization },
    organizationMember: { findUnique: member },
    workOrder: { findFirst: workOrder },
    $queryRaw: query, $executeRaw: vi.fn().mockResolvedValue(0),
  };
  const transaction = vi.fn(async (operation: (client: typeof db) => Promise<unknown>) => operation(db));
  const unit = new PrismaWorkOrderAcceptanceUnitOfWork({ $transaction: transaction } as unknown as PrismaService);

  return { unit, organization, member, workOrder, query, transaction };
}

describe('PrismaWorkOrderAcceptanceUnitOfWork', () => {
  it('loads access for the requested tenant and exposes a scoped repository', async () => {
    const f = fixture();
    await f.unit.read(params, async (context) => {
      expect(context.access).toMatchObject({ isMember: false, hasPlatformAccess: false });
      expect(context.acceptances).toBeDefined();
    });
    expect(f.member).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_userId: { organizationId: 'org', userId: 'owner' } },
    }));
    expect(f.transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'RepeatableRead' }));
  });

  it.each([null, { id: 'order' }])('limits order lookup to the requested organization', async (value) => {
    const f = fixture();
    f.workOrder.mockResolvedValue(value);
    expect(await f.unit.read(params, (tx) => tx.findWorkOrder())).toEqual(value);
    expect(f.workOrder).toHaveBeenCalledWith({
      where: { id: 'order', organizationId: 'org' },
      select: { id: true, organizationId: true, status: true, completedAt: true, version: true },
    });
  });

  it('rejects a missing organization before invoking the callback', async () => {
    const f = fixture();
    f.organization.mockResolvedValue(null);
    const operation = vi.fn();
    await expect(f.unit.read(params, operation)).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    expect(operation).not.toHaveBeenCalled();
  });
});
