import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { PrismaNotificationOutbox } from '../../../notifications/infrastructure/repositories/prismaNotificationOutbox.repository.js';

import { PrismaBillingSuccessNotificationUnitOfWork } from './prismaBillingSuccessNotificationUnitOfWork.js';

const now = new Date('2026-01-01T00:00:00Z');

function fixture() {
  const owner = { id: 'user', email: 'owner@example.com', disabledAt: null, emailVerifiedAt: now };
  const organization = { id: 'organization', name: 'Fixture', owner };
  const invoice = {
    id: 'invoice',
    stripeInvoiceId: 'in_fixture',
    billingReason: 'subscription_cycle',
    number: '001',
    amountPaid: 1000,
    currency: 'brl',
    paidAt: now,
    subscription: { status: 'active' },
    organization,
  };
  const change = {
    id: 'change',
    updatedAt: now,
    targetPlanPrice: { plan: { name: 'Pro' } },
    organization,
  };
  const query = vi.fn().mockResolvedValue([]);
  const invoiceRead = vi.fn().mockResolvedValue(invoice);
  const changeRead = vi.fn().mockResolvedValue(change);
  const invoiceUpdate = vi.fn().mockResolvedValue(invoice);
  const changeUpdate = vi.fn().mockResolvedValue(change);
  const db = {
    $queryRaw: query,
    billingInvoice: { findUniqueOrThrow: invoiceRead, update: invoiceUpdate },
    planChange: { findUniqueOrThrow: changeRead, update: changeUpdate },
  };
  const transaction = vi.fn(async (callback: (client: typeof db) => Promise<boolean>) => callback(db));
  const notifyWorker = vi.fn();
  const using = vi.fn((_client: unknown, _inserted: () => void) => ({}));
  const unit = new PrismaBillingSuccessNotificationUnitOfWork(
    { $transaction: transaction } as unknown as PrismaService,
    { using, notifyWorker } as unknown as PrismaNotificationOutbox,
  );

  return {
    unit,
    query,
    invoiceRead,
    changeRead,
    invoiceUpdate,
    changeUpdate,
    transaction,
    notifyWorker,
    using,
    invoice,
    change,
  };
}

describe('PrismaBillingSuccessNotificationUnitOfWork', () => {
  it('returns false when no invoice or plan change is eligible', async () => {
    const f = fixture();
    const operation = vi.fn();

    expect(await f.unit.run(operation)).toBe(false);
    expect(f.query).toHaveBeenCalledTimes(2);
    expect(operation).not.toHaveBeenCalled();
    expect(f.notifyWorker).not.toHaveBeenCalled();
  });

  it('prioritizes invoices, locks the selected row and checkpoints only after processing', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([{ id: 'invoice' }]);
    const operation = vi.fn(async () => {
      expect(f.invoiceUpdate).not.toHaveBeenCalled();
    });

    expect(await f.unit.run(operation)).toBe(true);
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(f.query.mock.calls[0]![0].join(' ')).toContain('FOR UPDATE SKIP LOCKED');
    expect(operation).toHaveBeenCalledWith(
      expect.objectContaining({
        billingSuccessNotification: expect.objectContaining({
          kind: 'INVOICE',
          id: 'invoice',
          organizationId: 'organization',
          recipient: { userId: 'user', email: 'owner@example.com', enabled: true },
        }),
      }),
    );
    expect(f.invoiceUpdate).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'invoice' },
      data: { paymentNotificationHandledAt: expect.any(Date) },
    });
    expect(f.changeUpdate).not.toHaveBeenCalled();
    expect(f.notifyWorker).not.toHaveBeenCalled();
  });

  it('processes a plan change when no invoice is available', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'change' }]);
    const operation = vi.fn();

    expect(await f.unit.run(operation)).toBe(true);
    expect(operation).toHaveBeenCalledWith(
      expect.objectContaining({
        billingSuccessNotification: expect.objectContaining({ kind: 'PLAN_CHANGE', id: 'change', planName: 'Pro' }),
      }),
    );
    expect(f.changeUpdate).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'change' },
      data: { appliedNotificationHandledAt: expect.any(Date) },
    });
    expect(f.invoiceUpdate).not.toHaveBeenCalled();
  });

  it.each([
    { disabledAt: now, emailVerifiedAt: now },
    { disabledAt: null, emailVerifiedAt: null },
  ])('disables email delivery for an ineligible owner', async (patch) => {
    const f = fixture();
    f.query.mockResolvedValueOnce([{ id: 'invoice' }]);
    f.invoiceRead.mockResolvedValue({
      ...f.invoice,
      organization: { ...f.invoice.organization, owner: { ...f.invoice.organization.owner, ...patch } },
    });
    const operation = vi.fn();

    await f.unit.run(operation);
    expect(operation).toHaveBeenCalledWith(
      expect.objectContaining({
        billingSuccessNotification: expect.objectContaining({
          recipient: expect.objectContaining({ enabled: false }),
        }),
      }),
    );
  });

  it('does not checkpoint or wake the worker after a failed operation', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([{ id: 'invoice' }]);
    const error = new Error('notification failed');

    await expect(
      f.unit.run(async () => {
        f.using.mock.calls[0]![1]();
        throw error;
      }),
    ).rejects.toBe(error);
    expect(f.invoiceUpdate).not.toHaveBeenCalled();
    expect(f.notifyWorker).not.toHaveBeenCalled();
  });

  it('wakes the worker only after the transaction has completed', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([{ id: 'invoice' }]);

    await f.unit.run(async () => {
      f.using.mock.calls[0]![1]();
      expect(f.notifyWorker).not.toHaveBeenCalled();
    });

    expect(f.notifyWorker).toHaveBeenCalledTimes(1);
    expect(f.invoiceUpdate.mock.invocationCallOrder[0]).toBeLessThan(f.notifyWorker.mock.invocationCallOrder[0]!);
  });

  it('does not wake the worker when checkpoint persistence fails', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([{ id: 'invoice' }]);
    const error = new Error('checkpoint failed');
    f.invoiceUpdate.mockRejectedValue(error);

    await expect(
      f.unit.run(async () => {
        f.using.mock.calls[0]![1]();
      }),
    ).rejects.toBe(error);
    expect(f.notifyWorker).not.toHaveBeenCalled();
  });
});
