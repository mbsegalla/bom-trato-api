import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { PrismaNotificationOutbox } from '../../../notifications/infrastructure/repositories/prismaNotificationOutbox.repository.js';
import { PrismaWorkOrderUnitOfWork } from './prismaWorkOrderUnitOfWork.js';

const params = { organizationId: 'org', userId: 'user' };
function fixture() {
  const organization = vi.fn().mockResolvedValue({ id: 'org' });
  const member = vi.fn().mockResolvedValue(null);
  const members = vi.fn().mockResolvedValue([]);
  const assignable = vi.fn().mockResolvedValue(null);
  const customer = vi.fn().mockResolvedValue(null);
  const catalog = vi.fn().mockResolvedValue(null);
  const workOrder = vi.fn().mockResolvedValue(null);
  const query = vi.fn().mockResolvedValue([{ id: 'org' }]);
  const execute = vi.fn().mockResolvedValue(0);
  const db = {
    organization: { findUnique: organization },
    organizationMember: { findUnique: member, findMany: members, findFirst: assignable },
    customer: { findFirst: customer }, catalogService: { findFirst: catalog },
    workOrder: { findFirst: workOrder }, $queryRaw: query, $executeRaw: execute,
  };
  const transaction = vi.fn(async (operation: (client: typeof db) => Promise<unknown>) => operation(db));
  const using = vi.fn((_client: unknown, _inserted: () => void) => ({}));
  const notifyWorker = vi.fn();
  const prisma = { $transaction: transaction } as unknown as PrismaService;
  const outbox = { using, notifyWorker } as unknown as PrismaNotificationOutbox;
  return { prisma, outbox, organization, member, members, assignable, customer, catalog, workOrder, query, execute, transaction, using, notifyWorker };
}

describe('PrismaWorkOrderUnitOfWork', () => {
  it('reads the requested tenant membership without creating notification context', async () => {
    const f = fixture();
    const unit = new PrismaWorkOrderUnitOfWork(f.prisma, f.outbox);
    expect(await unit.read(params, async (tx) => tx.access)).toMatchObject({ isMember: false, verified: false, hasPlatformAccess: false });
    expect(f.member).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId_userId: params } }));
    expect(f.using).not.toHaveBeenCalled();
  });

  it.each([{ members: [] }, { members: [{ userId: 'one' }] }, { members: [{ userId: 'one' }, { userId: 'two' }] }])('assigns only an unambiguous eligible member', async ({ members }) => {
    const f = fixture();
    f.members.mockResolvedValue(members);
    const unit = new PrismaWorkOrderUnitOfWork(f.prisma, f.outbox);
    expect(await unit.run(params, (tx) => tx.findSingleAssignableMember())).toBe(members.length === 1 ? 'one' : null);
    expect(f.members).toHaveBeenCalledWith({
      where: { organizationId: 'org', user: { disabledAt: null, emailVerifiedAt: { not: null } } },
      select: { userId: true }, take: 2,
    });
  });

  it.each([null, { defaultServiceAddress: null }, { defaultServiceAddress: 'Fixture address' }])('reads customer address only within the tenant', async (customer) => {
    const f = fixture();
    f.customer.mockResolvedValue(customer);
    const unit = new PrismaWorkOrderUnitOfWork(f.prisma, f.outbox);
    expect(await unit.run(params, (tx) => tx.findCustomerDefaultServiceAddress('customer'))).toBe(customer?.defaultServiceAddress ?? null);
    expect(f.customer).toHaveBeenCalledWith({ where: { id: 'customer', organizationId: 'org' }, select: { defaultServiceAddress: true } });
  });

  it('rejects missing tenants before running callbacks', async () => {
    const f = fixture();
    f.organization.mockResolvedValue(null);
    f.query.mockResolvedValue([]);
    const unit = new PrismaWorkOrderUnitOfWork(f.prisma, f.outbox);
    const operation = vi.fn();
    await expect(unit.read(params, operation)).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    await expect(unit.run(params, operation)).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    expect(operation).not.toHaveBeenCalled();
  });

  it('notifies the worker once after a successful commit', async () => {
    const f = fixture();
    const unit = new PrismaWorkOrderUnitOfWork(f.prisma, f.outbox);
    await expect(unit.run(params, async () => {
      f.using.mock.calls[0]![1]();
      f.using.mock.calls[0]![1]();
      expect(f.notifyWorker).not.toHaveBeenCalled();
      return 'saved';
    })).resolves.toBe('saved');
    expect(f.notifyWorker).toHaveBeenCalledTimes(1);
  });

  it('does not notify after a failed transaction', async () => {
    const f = fixture();
    const unit = new PrismaWorkOrderUnitOfWork(f.prisma, f.outbox);
    const error = new Error('write failed');
    await expect(unit.run(params, async () => {
      f.using.mock.calls[0]![1]();
      throw error;
    })).rejects.toBe(error);
    expect(f.notifyWorker).not.toHaveBeenCalled();
  });

  it.each([null, { defaultReceivableDueDays: 0 }, { defaultReceivableDueDays: 30 }])('uses configured due days or safe default', async (value) => {
    const f = fixture();
    f.organization.mockResolvedValue(value);
    const unit = new PrismaWorkOrderUnitOfWork(f.prisma, f.outbox);
    expect(await unit.run(params, (tx) => tx.findDefaultReceivableDueDays())).toBe(value?.defaultReceivableDueDays ?? 7);
  });

  it.each([null, { autoReviewRequestEnabled: true }, { autoReviewRequestEnabled: false }])('reads review automation settings safely', async (value) => {
    const f = fixture();
    f.organization.mockResolvedValue(value);
    const unit = new PrismaWorkOrderUnitOfWork(f.prisma, f.outbox);
    expect(await unit.run(params, (tx) => tx.findAutomationSettings())).toEqual({ autoReviewRequestEnabled: value?.autoReviewRequestEnabled ?? false });
  });

  it.each([null, { id: 'member' }])('checks assignable members within the tenant', async (value) => {
    const f = fixture();
    f.assignable.mockResolvedValue(value);
    const unit = new PrismaWorkOrderUnitOfWork(f.prisma, f.outbox);
    expect(await unit.run(params, (tx) => tx.isAssignableMember('member'))).toBe(value !== null);
    expect(f.assignable).toHaveBeenCalledWith({
      where: { organizationId: 'org', userId: 'member', user: { disabledAt: null, emailVerifiedAt: { not: null } } },
      select: { id: true },
    });
  });
});
