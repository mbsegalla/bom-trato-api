import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaReceivableRepository } from '../../../src/modules/receivables/infrastructure/repositories/prismaReceivable.repository.js';
import { MercadoPagoError } from '../../../src/modules/receivables/infrastructure/providers/mercadoPago/mercadoPagoClient.js';

import { createPaymentFixture, paymentIntegrationSuite } from './support/payment.fixture.js';

paymentIntegrationSuite('livePixSettlement (disposable PostgreSQL)', () => {
  const context = createPaymentFixture();

  it('processes only the live inbox and commits concurrent approvals exactly once', async () => {
    const { prisma, settlementFixture, ledger } = context;

    const f = await settlementFixture();
    const first = f.notice();
    const second = f.notice();

    await f.sandbox.enqueue(first);

    expect(await f.inbox.claim(f.clientId, randomUUID())).toBeNull();

    await Promise.all([f.inbox.enqueue(first), f.inbox.enqueue(first), f.inbox.enqueue(second)]);
    const jobs = await Promise.all([f.claim(), f.claim()]);

    expect(new Set(jobs.map((job) => job.deliveryKey)).size).toBe(2);
    expect(await f.inbox.claim(f.clientId, randomUUID())).toBeNull();

    expect(await Promise.all(jobs.map((job) => f.processor.execute(job)))).toEqual([true, true]);

    const events = await Promise.all(jobs.map((job) => f.stored(job)));

    expect(events.map((event) => event.resultCode).sort()).toEqual(['LEDGER_APPLIED', 'LEDGER_DUPLICATE']);

    for (const event of events) {
      expect(event.processedAt).toBeInstanceOf(Date);
      expect(event.matchedIssuanceId).toBe(f.issuance.issuanceId);
    }
    const state = await ledger(f.receivable.id);

    expect(state.receivable).toMatchObject({ receivedInCents: 10_000, status: 'PAID', version: 2 });
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0]).toMatchObject({ requestId: f.issuance.issuanceId, method: 'PIX' });
    expect(await f.issuanceRow()).toMatchObject({
      status: 'SETTLED',
      copyAndPasteCiphertext: null,
      expiresAt: null,
    });
    expect(await prisma.mercadoPagoWebhookEvent.count({ where: { clientId: f.clientId, processedAt: null } })).toBe(1);
  }, 30_000);

  it('does not commit a payment if the processing lease expired during provider I/O', async () => {
    const { prisma, settlementFixture, ledger } = context;

    const f = await settlementFixture();
    const job = await f.delivery();
    f.read.mockImplementationOnce(async (input) => {
      await prisma.mercadoPagoLiveWebhookEvent.update({
        where: { clientId_deliveryKey: { clientId: job.clientId, deliveryKey: job.deliveryKey } },
        data: { leaseExpiresAt: new Date(Date.now() - 1000) },
      });

      return { status: 'APPROVED', payment: f.approval(input.eventId) };
    });

    expect(await f.processor.execute(job)).toBe(false);
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
    expect(await f.issuanceRow()).toMatchObject({ status: 'PENDING' });

    const replacement = await f.claim();

    expect(replacement.deliveryKey).toBe(job.deliveryKey);
    expect(replacement.leaseToken).not.toBe(job.leaseToken);
    expect(await f.processor.execute(replacement)).toBe(true);
    expect(await f.stored(replacement)).toMatchObject({ resultCode: 'LEDGER_APPLIED', attempts: 1 });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(1);
  });

  it('rolls back the live inbox, reservation, charge and ledger as one transaction', async () => {
    const { settlementFixture, ledger } = context;

    const f = await settlementFixture();
    const job = await f.delivery();
    const failure = vi.spyOn(PrismaReceivableRepository.prototype, 'createPayment')
      .mockRejectedValueOnce(new Error('Injected live payment failure'));

    await expect(f.processor.execute(job)).rejects.toThrow('Injected live payment failure');

    failure.mockRestore();

    expect(await f.stored(job)).toMatchObject({ processedAt: null, reviewRequiredAt: null, attempts: 0 });
    expect(await f.issuanceRow()).toMatchObject({ status: 'PENDING' });
    expect(await ledger(f.receivable.id)).toMatchObject({
      receivable: { receivedInCents: 0, status: 'OPEN', version: 1 },
      payments: [],
    });
    expect(await f.processor.execute(job)).toBe(true);
    expect(await f.stored(job)).toMatchObject({ resultCode: 'LEDGER_APPLIED', attempts: 1 });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(1);
  });

  it('retains a refund after settlement without automatically reversing or reapplying the ledger', async () => {
    const { settlementFixture, ledger } = context;

    const f = await settlementFixture();
    const approved = await f.delivery();

    expect(await f.processor.execute(approved)).toBe(true);

    const refund = await f.delivery();
    f.read.mockResolvedValueOnce({ status: 'REFUNDED' });

    expect(await f.processor.execute(refund)).toBe(true);
    expect(await f.stored(refund)).toMatchObject({ resultCode: 'VERIFIED_REFUNDED', processedAt: null });
    expect((await f.stored(refund)).reviewRequiredAt).toBeInstanceOf(Date);
    expect(await f.issuanceRow()).toMatchObject({
      status: 'REVIEW_REQUIRED',
      settlementReviewCode: 'VERIFIED_REFUNDED',
      copyAndPasteCiphertext: null,
    });

    const late = await f.delivery();

    expect(await f.processor.execute(late)).toBe(true);
    expect(await f.stored(late)).toMatchObject({ resultCode: 'ISSUANCE_REVIEW_REQUIRED', processedAt: null });
    expect(await ledger(f.receivable.id)).toMatchObject({
      receivable: { receivedInCents: 10_000, status: 'PAID', version: 2 },
    });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(1);
  });

  it('blocks an earlier approval after refund evidence and does not allow a generic confirmation to bypass the inbox', async () => {
    const { useCase, settlementFixture, ledger } = context;

    const f = await settlementFixture();
    const approval = await f.delivery();
    const prepared = await f.inbox.prepare(approval);
    if (prepared.kind !== 'READY') throw new Error('Fixture preparation failed');

    const refund = await f.delivery();
    f.read.mockResolvedValueOnce({ status: 'REFUNDED' });

    expect(await f.processor.execute(refund)).toBe(true);
    expect(await f.inbox.settle(approval, {
      kind: 'CHECKED',
      binding: prepared.binding,
      stamp: prepared.stamp,
      observation: { status: 'APPROVED', payment: f.approval(approval.deliveryKey) },
    })).toBe(true);
    expect(await f.stored(approval)).toMatchObject({ resultCode: 'ISSUANCE_REVIEW_REQUIRED' });
    expect(await useCase.execute(f.approval(approval.deliveryKey))).toBe('REVIEW_REQUIRED');
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('retains unknown identities and provider outages for retry, never trying another seller', async () => {
    const { settlementFixture, ledger } = context;

    const f = await settlementFixture();
    const unknown = f.notice('987654321');

    await f.inbox.enqueue(unknown);
    const missing = await f.claim();

    expect(await f.processor.execute(missing)).toBe(true);
    expect(f.read).not.toHaveBeenCalled();
    expect(await f.stored(missing)).toMatchObject({
      resultCode: 'UNMATCHED_PAYMENT',
      attempts: 1,
      processedAt: null,
      reviewRequiredAt: null,
    });

    const outage = await f.delivery();
    f.read.mockRejectedValueOnce(new MercadoPagoError('REQUEST_FAILED', 503));

    expect(await f.processor.execute(outage)).toBe(true);
    expect(await f.stored(outage)).toMatchObject({
      resultCode: 'PROVIDER_UNAVAILABLE',
      attempts: 1,
      processedAt: null,
      reviewRequiredAt: null,
    });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('refuses a sandbox or inconsistent approval even when the identifiers are otherwise correct', async () => {
    const { settlementFixture, ledger } = context;

    const f = await settlementFixture();
    const job = await f.delivery();
    f.read.mockResolvedValueOnce({ status: 'APPROVED', payment: { ...f.approval(job.deliveryKey), liveMode: false } });

    expect(await f.processor.execute(job)).toBe(true);
    expect(await f.stored(job)).toMatchObject({ resultCode: 'INVALID_PROVIDER_PAYMENT', processedAt: null });
    expect(await f.issuanceRow()).toMatchObject({
      status: 'REVIEW_REQUIRED',
      settlementReviewCode: 'INVALID_PROVIDER_PAYMENT',
    });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('retains a changed receivable for review and does not apply a stale settlement', async () => {
    const { prisma, settlementFixture, ledger } = context;

    const f = await settlementFixture();
    await prisma.receivable.update({
      where: { id: f.receivable.id },
      data: { version: 2, notes: 'Changed after issuance' },
    });
    const job = await f.delivery();

    expect(await f.processor.execute(job)).toBe(true);
    expect(await f.stored(job)).toMatchObject({ resultCode: 'LEDGER_REVIEW_REQUIRED', processedAt: null });
    expect(await f.issuanceRow()).toMatchObject({
      status: 'REVIEW_REQUIRED',
      settlementReviewCode: 'LEDGER_REVIEW_REQUIRED',
    });
    expect(await prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id: f.issuance.issuanceId } }))
      .toMatchObject({ reviewReason: 'RECEIVABLE_CHANGED', paymentId: null });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('records owner changes without consulting another seller token', async () => {
    const {
      prisma,
      users,
      settlementFixture,
      ledger
    } = context;

    const f = await settlementFixture();
    const successor = await prisma.user.create({
      data: {
        name: 'Fixture successor',
        email: randomUUID() + '@example.invalid',
        emailVerifiedAt: new Date()
      },
    });
    users.push(successor.id);

    await prisma.organization.update({
      where: { id: f.actor.organizationId },
      data: { ownerId: successor.id },
    });
    const job = await f.delivery();

    expect(await f.processor.execute(job)).toBe(true);
    expect(f.read).not.toHaveBeenCalled();
    expect(await f.stored(job)).toMatchObject({ resultCode: 'OWNER_CHANGED', processedAt: null });
    expect(await f.issuanceRow()).toMatchObject({ status: 'REVIEW_REQUIRED', settlementReviewCode: 'OWNER_CHANGED' });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('never reopens a closed issuance when a pending event arrives or auto-applies a late approval', async () => {
    const { settlementFixture, ledger } = context;

    const f = await settlementFixture();
    const closed = await f.delivery();
    f.read.mockResolvedValueOnce({ status: 'CLOSED' });

    expect(await f.processor.execute(closed)).toBe(true);
    expect(await f.issuanceRow()).toMatchObject({ status: 'CLOSED', copyAndPasteCiphertext: null });

    const pending = await f.delivery();
    f.read.mockResolvedValueOnce({ status: 'PENDING' });

    expect(await f.processor.execute(pending)).toBe(true);
    expect(await f.issuanceRow()).toMatchObject({ status: 'CLOSED' });

    const late = await f.delivery();

    expect(await f.processor.execute(late)).toBe(true);
    expect(await f.stored(late)).toMatchObject({ resultCode: 'APPROVAL_AFTER_CLOSURE', processedAt: null });
    expect(await f.issuanceRow()).toMatchObject({
      status: 'REVIEW_REQUIRED',
      settlementReviewCode: 'APPROVAL_AFTER_CLOSURE',
    });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });
  it('does not apply a payment for a pending provider observation before approval', async () => {
    const { settlementFixture, ledger } = context;
    const f = await settlementFixture();
    const pending = await f.delivery();
    f.read.mockResolvedValueOnce({ status: 'PENDING' });

    expect(await f.processor.execute(pending)).toBe(true);
    expect(await f.issuanceRow()).toMatchObject({ status: 'PENDING' });
    expect(await ledger(f.receivable.id)).toMatchObject({
      receivable: { receivedInCents: 0, version: 1, status: 'OPEN' },
      payments: [],
    });

    const approved = await f.delivery();

    expect(await f.processor.execute(approved)).toBe(true);
    expect(await f.stored(approved)).toMatchObject({ resultCode: 'LEDGER_APPLIED' });
    expect(await ledger(f.receivable.id)).toMatchObject({
      receivable: { receivedInCents: 10000, version: 2, status: 'PAID' },
    });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(1);
  });
});
