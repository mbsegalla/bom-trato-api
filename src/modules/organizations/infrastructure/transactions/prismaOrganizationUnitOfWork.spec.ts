import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { PrismaNotificationOutbox } from '../../../notifications/infrastructure/repositories/prismaNotificationOutbox.repository.js';

import { PrismaOrganizationUnitOfWork } from './prismaOrganizationUnitOfWork.js';

const params = { organizationId: 'org', userId: 'user' };
const organization = {
  id: 'org',
  name: 'Fixture',
  email: null,
  phone: null,
  logoKey: null,
  documentType: null,
  document: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  postalCode: null,
  ownerId: 'user',
  defaultReceivableDueDays: 7,
  autoQuoteFollowUpEnabled: false,
  autoWorkOrderReminderEnabled: false,
  autoReviewRequestEnabled: false,
  autoReceivableReminderEnabled: false,
};

function fixture() {
  const findUser = vi.fn().mockResolvedValue({
    id: 'user',
    name: 'User',
    email: 'fixture@example.invalid',
    disabledAt: null,
    emailVerifiedAt: new Date(),
  });
  const findOrganization = vi.fn().mockResolvedValue({ id: 'org' });
  const readOrganization = vi.fn().mockResolvedValue(organization);
  const findMember = vi.fn().mockResolvedValue({ role: 'OWNER' });
  const update = vi.fn().mockResolvedValue({ count: 1 });
  const query = vi.fn().mockResolvedValue([{ id: 'org' }]);
  const execute = vi.fn().mockResolvedValue(0);
  const db = {
    user: { findUnique: findUser },
    organization: { findUnique: findOrganization, findUniqueOrThrow: readOrganization, updateMany: update },
    organizationMember: { findUnique: findMember },
    $queryRaw: query,
    $executeRaw: execute,
  };
  const transaction = vi.fn(async (operation: (client: typeof db) => Promise<unknown>) => operation(db));
  const using = vi.fn((_client: unknown, _inserted: () => void) => ({}));
  const notifyWorker = vi.fn();
  const unit = new PrismaOrganizationUnitOfWork(
    { $transaction: transaction } as unknown as PrismaService,
    { using, notifyWorker } as unknown as PrismaNotificationOutbox,
  );

  return {
    unit,
    findUser,
    findOrganization,
    readOrganization,
    findMember,
    update,
    query,
    execute,
    transaction,
    using,
    notifyWorker,
  };
}

describe('PrismaOrganizationUnitOfWork', () => {
  it('reads actor and membership within the requested organization', async () => {
    const f = fixture();
    const result = await f.unit.read(params, async (context) => ({
      organization: context.organization,
      actor: context.actor,
      actorRole: context.actorRole,
    }));

    expect(result).toMatchObject({
      organization,
      actor: { id: 'user', disabled: false, emailVerified: true },
      actorRole: 'OWNER',
    });
    expect(f.findMember).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_userId: { organizationId: 'org', userId: 'user' } },
      }),
    );
    expect(f.using).not.toHaveBeenCalled();
  });

  it('retains absent membership and disabled actor facts for the authorization policy', async () => {
    const f = fixture();
    f.findMember.mockResolvedValue(null);
    f.findUser.mockResolvedValue({
      id: 'user',
      name: 'User',
      email: 'fixture@example.invalid',
      disabledAt: new Date(),
      emailVerifiedAt: null,
    });

    expect(await f.unit.read(params, async (context) => context)).toMatchObject({
      actorRole: null,
      actor: { disabled: true, emailVerified: false },
    });
  });

  it('rejects an unknown actor before loading membership', async () => {
    const f = fixture();
    f.findUser.mockResolvedValue(null);
    const operation = vi.fn();

    await expect(f.unit.read(params, operation)).rejects.toThrow('VERIFIED_USER_REQUIRED');
    expect(operation).not.toHaveBeenCalled();
    expect(f.findMember).not.toHaveBeenCalled();
  });

  it('rejects a missing organization in read and write transactions', async () => {
    const f = fixture();
    f.findOrganization.mockResolvedValue(null);
    f.query.mockResolvedValue([]);
    const operation = vi.fn();

    await expect(f.unit.read(params, operation)).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    await expect(f.unit.run(params, operation)).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    expect(operation).not.toHaveBeenCalled();
  });

  it('scopes organization updates and excludes ownership from writable fields', async () => {
    const f = fixture();

    await f.unit.run(params, async (tx) => {
      await tx.saveOrganization({ ...tx.organization, name: 'Changed' });
    });

    expect(f.update).toHaveBeenCalledWith({
      where: { id: 'org' },
      data: expect.objectContaining({ name: 'Changed', defaultReceivableDueDays: 7 }),
    });
    expect(f.update.mock.calls[0][0].data).not.toHaveProperty('ownerId');
    expect(f.query.mock.calls[0][0].join(' ')).toContain('FOR UPDATE');
    expect(f.notifyWorker).not.toHaveBeenCalled();
  });

  it('rejects cross-organization updates before writing', async () => {
    const f = fixture();

    await expect(
      f.unit.run(params, (tx) => tx.saveOrganization({ ...tx.organization, id: 'foreign' })),
    ).rejects.toThrow('ORGANIZATION_NOT_FOUND');
    expect(f.update).not.toHaveBeenCalled();
  });

  it('rejects an update whose target no longer exists', async () => {
    const f = fixture();
    f.update.mockResolvedValue({ count: 0 });

    await expect(f.unit.run(params, (tx) => tx.saveOrganization(tx.organization))).rejects.toThrow(
      'ORGANIZATION_NOT_FOUND',
    );
  });

  it('wakes notifications only after a successful transaction', async () => {
    const f = fixture();
    await f.unit.run(params, async () => {
      f.using.mock.calls[0][1]();
      expect(f.notifyWorker).not.toHaveBeenCalled();
    });
    expect(f.notifyWorker).toHaveBeenCalledTimes(1);
  });

  it('does not wake notifications after transaction failure', async () => {
    const f = fixture();
    const failure = new Error('fixture failure');

    await expect(
      f.unit.run(params, async () => {
        f.using.mock.calls[0][1]();
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(f.notifyWorker).not.toHaveBeenCalled();
  });
});
