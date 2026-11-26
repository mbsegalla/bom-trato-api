import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

import { PrismaWorkOrderChecklistUnitOfWork } from './prismaWorkOrderChecklistUnitOfWork.js';

const params = { organizationId: 'org', userId: 'owner', workOrderId: 'order' };

function fixture() {
  const organization = vi.fn().mockResolvedValue({ id: 'org' });
  const member = vi.fn().mockResolvedValue(null);
  const workOrder = vi.fn().mockResolvedValue(null);
  const query = vi
    .fn<(parts: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>>()
    .mockResolvedValue([{ id: 'org' }]);
  const db = {
    organization: { findUnique: organization },
    organizationMember: { findUnique: member },
    workOrder: { findFirst: workOrder },
    $queryRaw: query,
    $executeRaw: vi.fn().mockResolvedValue(0),
  };
  const transaction = vi.fn(async (operation: (client: typeof db) => Promise<unknown>) => operation(db));
  const unit = new PrismaWorkOrderChecklistUnitOfWork({ $transaction: transaction } as unknown as PrismaService);

  return { unit, organization, member, workOrder, query, transaction };
}

describe('PrismaWorkOrderChecklistUnitOfWork', () => {
  it('loads access for the requested tenant and exposes a scoped repository', async () => {
    const f = fixture();
    await f.unit.read(params, async (context) => {
      expect(context.access).toMatchObject({ isMember: false, hasPlatformAccess: false });
      expect(context.checklist).toBeDefined();
    });
    expect(f.member).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_userId: { organizationId: 'org', userId: 'owner' } },
      }),
    );
    expect(f.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'RepeatableRead' }),
    );
  });

  it.each([null, { id: 'order' }])('limits order lookup to the requested organization', async (value) => {
    const f = fixture();
    f.workOrder.mockResolvedValue(value);
    expect(await f.unit.read(params, (tx) => tx.workOrderExists())).toEqual(value !== null);
    expect(f.workOrder).toHaveBeenCalledWith({
      where: { id: 'order', organizationId: 'org' },
      select: { id: true },
    });
  });

  it('rejects a missing organization before invoking the callback', async () => {
    const f = fixture();
    f.organization.mockResolvedValue(null);
    const operation = vi.fn();
    await expect(f.unit.read(params, operation)).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    expect(operation).not.toHaveBeenCalled();
  });

  it('locks the organization during a write and propagates the result', async () => {
    const f = fixture();
    expect(await f.unit.run(params, async () => 'saved')).toBe('saved');
    expect(f.query.mock.calls[0][0].join(' ')).toContain('FOR UPDATE');
  });

  it('rejects writes to missing organizations', async () => {
    const f = fixture();
    f.query.mockResolvedValue([]);
    const operation = vi.fn();
    await expect(f.unit.run(params, operation)).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    expect(operation).not.toHaveBeenCalled();
  });

  it('does not retry nonretryable operation errors', async () => {
    const f = fixture();
    const error = new Error('fixture failure');
    const operation = vi.fn().mockRejectedValue(error);
    await expect(f.unit.run(params, operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
