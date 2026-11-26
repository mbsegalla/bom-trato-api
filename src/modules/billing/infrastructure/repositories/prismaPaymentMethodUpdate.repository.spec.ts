import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PaymentMethodUpdate } from '../../domain/entities/paymentMethodUpdate.entity.js';
import { BillingWork } from '../events/billing.events.js';
import type { BillingWorkerNotifier } from '../events/billingWorkerNotifier.service.js';

import { PrismaPaymentMethodUpdateRepository } from './prismaPaymentMethodUpdate.repository.js';

const now = new Date('2026-01-01T00:00:00Z');

function fixture() {
  const update = PaymentMethodUpdate.create({
    id: 'update',
    organizationId: 'org',
    requestedById: 'owner',
    stripeCustomerId: 'cus_fixture',
    stripeSubscriptionId: 'sub_fixture',
    consentVersion: 'v1',
    consentAcceptedAt: now,
    expiresAt: new Date(now.getTime() + 600000),
  });
  const create = vi.fn().mockResolvedValue(update.snapshot());
  const findUnique = vi.fn().mockResolvedValue(null);
  const save = vi.fn().mockResolvedValue(update.snapshot());
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findMany = vi.fn().mockResolvedValue([]);
  const notify = vi.fn();
  const scheduleChanged = vi.fn();
  const repository = new PrismaPaymentMethodUpdateRepository(
    {
      paymentMethodUpdate: { create, findUnique, update: save, updateMany, findMany },
    } as unknown as PrismaService,
    { notify, scheduleChanged } as unknown as BillingWorkerNotifier,
  );

  return { repository, update, create, findUnique, save, updateMany, findMany, notify, scheduleChanged };
}

describe('PrismaPaymentMethodUpdateRepository', () => {
  it('reserves one active update per organization and wakes the worker only after persistence', async () => {
    const f = fixture();

    await f.repository.create(f.update);

    expect(f.create).toHaveBeenCalledWith({ data: { ...f.update.snapshot(), activeOrganizationId: 'org' } });
    expect(f.notify).toHaveBeenCalledWith(BillingWork.PAYMENT_METHOD_UPDATES);
    expect(f.create.mock.invocationCallOrder[0]).toBeLessThan(f.notify.mock.invocationCallOrder[0]!);

    f.create.mockRejectedValueOnce(new Error('Fixture write failure'));
    await expect(f.repository.create(f.update)).rejects.toThrow('Fixture write failure');
    expect(f.notify).toHaveBeenCalledTimes(1);
  });

  it('keeps the active identity during setup and releases it after a terminal outcome', async () => {
    const f = fixture();
    f.update.attachSetup({ id: 'seti_fixture', customerId: 'cus_fixture', updateId: 'update' });

    await f.repository.save(f.update);
    expect(f.save).toHaveBeenLastCalledWith({
      where: { id: 'update' },
      data: { status: 'PENDING', stripeSetupIntentId: 'seti_fixture', activeOrganizationId: 'org' },
    });

    f.update.markApplied();
    await f.repository.save(f.update);

    expect(f.save).toHaveBeenLastCalledWith({
      where: { id: 'update' },
      data: {
        status: 'APPLIED',
        stripeSetupIntentId: 'seti_fixture',
        activeOrganizationId: null,
        completedAt: expect.any(Date),
      },
    });
    expect(f.scheduleChanged).toHaveBeenCalledTimes(2);
  });

  it('looks up the active organization identity independently of the update ID', async () => {
    const f = fixture();

    await f.repository.find('update');
    await f.repository.active('org');

    expect(f.findUnique).toHaveBeenNthCalledWith(1, { where: { id: 'update' } });
    expect(f.findUnique).toHaveBeenNthCalledWith(2, { where: { activeOrganizationId: 'org' } });
  });

  it('reschedules only pending rows and avoids notifying after a lost race', async () => {
    const f = fixture();
    f.updateMany.mockResolvedValueOnce({ count: 0 });

    await f.repository.postpone('update', 30);
    expect(f.scheduleChanged).not.toHaveBeenCalled();

    await f.repository.postpone('update', 30);
    expect(f.scheduleChanged).toHaveBeenCalledWith(BillingWork.PAYMENT_METHOD_UPDATES);
    expect(f.updateMany).toHaveBeenCalledWith({
      where: { id: 'update', status: 'PENDING' },
      data: { nextCheckAt: expect.any(Date) },
    });
  });

  it('limits pending work to five due records in stable order', async () => {
    const f = fixture();

    expect(await f.repository.due()).toEqual([]);
    expect(f.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING', nextCheckAt: { lte: expect.any(Date) } },
      orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }],
      take: 5,
    });
  });
});
