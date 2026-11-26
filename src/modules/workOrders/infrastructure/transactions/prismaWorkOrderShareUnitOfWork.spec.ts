import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PrismaWorkOrderShareUnitOfWork } from './prismaWorkOrderShareUnitOfWork.js';

const params = { organizationId: 'org', userId: 'owner' };

function fixture() {
  const organization = vi.fn().mockResolvedValue({ id: 'org' });
  const member = vi.fn().mockResolvedValue(null);
  const workOrder = vi.fn().mockResolvedValue(null);
  const query = vi.fn().mockResolvedValue([{ id: 'org' }]);
  const execute = vi.fn().mockResolvedValue(0);
  const db = {
    organization: { findUnique: organization },
    organizationMember: { findUnique: member },
    workOrder: { findFirst: workOrder },
    $queryRaw: query, $executeRaw: execute,
  };
  const transaction = vi.fn(async (operation: (client: typeof db) => Promise<unknown>) => operation(db));
  const unit = new PrismaWorkOrderShareUnitOfWork({ $transaction: transaction } as unknown as PrismaService);

  return { unit, organization, member, workOrder, query, execute, transaction };
}

describe('PrismaWorkOrderShareUnitOfWork', () => {
  it('reads membership within the requested organization', async () => {
    const f = fixture();

    expect(await f.unit.read(params, async (context) => context.access)).toMatchObject({
      isMember: false, verified: false, hasPlatformAccess: false,
    });
    expect(f.member).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId_userId: params } }));
    expect(f.transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'RepeatableRead' }));
  });

  it('scopes work order lookup to the tenant and selects only required fields', async () => {
    const f = fixture();

    expect(await f.unit.run(params, (tx) => tx.findWorkOrder('order'))).toBeNull();
    expect(f.workOrder).toHaveBeenCalledWith({
      where: { id: 'order', organizationId: 'org' },
      select: { id: true, organizationId: true, version: true },
    });
    expect(f.query.mock.calls[0]![0].join(' ')).toContain('FOR UPDATE');
  });

  it('rejects missing organizations in both transaction modes', async () => {
    const f = fixture();
    f.organization.mockResolvedValue(null);
    f.query.mockResolvedValue([]);
    const operation = vi.fn();

    await expect(f.unit.read(params, operation)).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    await expect(f.unit.run(params, operation)).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    expect(operation).not.toHaveBeenCalled();
  });

  it('propagates operation failure without rerunning nonretryable operations', async () => {
    const f = fixture();
    const failure = new Error('fixture failure');
    const operation = vi.fn().mockRejectedValue(failure);

    await expect(f.unit.run(params, operation)).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
