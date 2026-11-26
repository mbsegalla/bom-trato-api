import { describe, expect, it, vi } from 'vitest';

import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';

import { SyncBillingUseCase } from './syncBilling.useCase.js';

const organizationId = 'org';
const customer = { stripeCustomerId: 'cus_fixture', invoiceHistorySyncedAt: null };
const snapshot = { subscriptions: [], invoices: [] };
const attempt = { id: 'attempt', stripeSessionId: 'cs_fixture' };
const syncedAt = new Date('2026-01-10T12:00:00Z');

function fixture() {
  const repository = {
    customer: vi.fn().mockResolvedValue(customer),
    pendingInvoiceIds: vi.fn().mockResolvedValue(['in_pending']),
    pendingCheckout: vi.fn().mockResolvedValue(null),
    saveSnapshot: vi.fn().mockResolvedValue(undefined),
  };
  const gateway = {
    snapshot: vi.fn().mockResolvedValue(snapshot),
    checkout: vi.fn().mockResolvedValue(null),
    findCheckout: vi.fn().mockResolvedValue(null),
  };
  const lock = { run: vi.fn(async (_key: string, operation: () => Promise<unknown>) => operation()) };
  const useCase = new SyncBillingUseCase(
    repository as unknown as BillingRepository,
    gateway as unknown as BillingGateway,
    lock as unknown as BillingLock,
  );

  return { repository, gateway, lock, useCase };
}

describe('SyncBillingUseCase', () => {
  it('serializes reconciliation by organization and saves a targeted invoice snapshot', async () => {
    const f = fixture();
    await f.useCase.execute({ organizationId, invoiceId: 'in_fixture' });

    expect(f.lock.run).toHaveBeenCalledWith('organization:org', expect.any(Function));
    expect(f.gateway.snapshot).toHaveBeenCalledWith(customer.stripeCustomerId, 'in_fixture', false, undefined);
    expect(f.repository.saveSnapshot).toHaveBeenCalledWith({
      organizationId,
      snapshot,
      checkout: undefined,
      nextReconcileAt: undefined,
      invoiceHistorySyncedAt: undefined,
    });
    expect(f.gateway.snapshot.mock.invocationCallOrder[0]).toBeLessThan(
      f.repository.saveSnapshot.mock.invocationCallOrder[0]!,
    );
  });

  it('requests full history on the first reconciliation and advances the checkpoint only when saving', async () => {
    const f = fixture();
    vi.useFakeTimers();
    vi.setSystemTime(syncedAt);

    try {
      await f.useCase.execute({ organizationId, reconcile: true });

      expect(f.gateway.snapshot).toHaveBeenCalledWith(customer.stripeCustomerId, undefined, true, undefined);
      expect(f.repository.pendingInvoiceIds).not.toHaveBeenCalled();
      expect(f.repository.saveSnapshot).toHaveBeenCalledWith({
        organizationId,
        snapshot,
        checkout: undefined,
        nextReconcileAt: new Date(syncedAt.getTime() + 3600000),
        invoiceHistorySyncedAt: syncedAt,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('overlaps incremental reconciliation by one day and includes unsettled invoice IDs', async () => {
    const f = fixture();
    f.repository.customer.mockResolvedValueOnce({ ...customer, invoiceHistorySyncedAt: syncedAt });

    await f.useCase.execute({ organizationId, reconcile: true });

    expect(f.repository.pendingInvoiceIds).toHaveBeenCalledWith(organizationId);
    expect(f.gateway.snapshot).toHaveBeenCalledWith(customer.stripeCustomerId, undefined, false, {
      createdSince: new Date(syncedAt.getTime() - 86400000),
      pendingInvoiceIds: ['in_pending'],
    });
  });

  it.each(['COMPLETE', 'EXPIRED'] as const)(
    'includes a confirmed %s checkout in the atomic snapshot',
    async (status) => {
      const f = fixture();
      f.repository.pendingCheckout.mockResolvedValueOnce(attempt);
      f.gateway.checkout.mockResolvedValueOnce({ stripeSessionId: attempt.stripeSessionId, status });

      await f.useCase.execute({ organizationId });

      expect(f.gateway.checkout).toHaveBeenCalledWith(attempt.stripeSessionId);
      expect(f.repository.saveSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          checkout: { id: attempt.id, stripeSessionId: attempt.stripeSessionId, status },
        }),
      );
    },
  );

  it('recovers an unattached checkout without closing a remotely open session', async () => {
    const f = fixture();
    f.repository.pendingCheckout.mockResolvedValueOnce({ ...attempt, stripeSessionId: null });
    f.gateway.findCheckout.mockResolvedValueOnce({ stripeSessionId: attempt.stripeSessionId, status: 'OPEN' });

    await f.useCase.execute({ organizationId });

    expect(f.gateway.findCheckout).toHaveBeenCalledWith(customer.stripeCustomerId, attempt.id);
    expect(f.repository.saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({ checkout: undefined }));
  });

  it('requires a remote customer and never persists an incomplete provider read', async () => {
    const f = fixture();
    f.repository.customer.mockResolvedValueOnce({ ...customer, stripeCustomerId: null });

    await expect(f.useCase.execute({ organizationId })).rejects.toThrow('BILLING_RECONCILIATION_REQUIRED');
    expect(f.gateway.snapshot).not.toHaveBeenCalled();

    const failure = new Error('Fixture Stripe read failure');
    f.gateway.snapshot.mockRejectedValueOnce(failure);

    await expect(f.useCase.execute({ organizationId })).rejects.toMatchObject({
      code: 'BILLING_READ_FAILED',
      cause: failure,
    });
    expect(f.repository.saveSnapshot).not.toHaveBeenCalled();
  });

  it('preserves domain errors and does not misclassify database write failures as provider reads', async () => {
    const f = fixture();
    const conflict = new BillingError('MULTIPLE_SUBSCRIPTIONS');
    f.gateway.snapshot.mockRejectedValueOnce(conflict);

    await expect(f.useCase.execute({ organizationId })).rejects.toBe(conflict);

    const writeFailure = new Error('Fixture persistence unavailable');
    f.repository.saveSnapshot.mockRejectedValueOnce(writeFailure);

    await expect(f.useCase.execute({ organizationId })).rejects.toBe(writeFailure);
  });
});
