import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { ConfirmReceivableProviderPaymentUseCase } from '../src/modules/receivables/application/useCases/confirmReceivableProviderPayment.useCase.js';
import type { RegisterProviderChargeInput, VerifiedProviderPayment } from '../src/modules/receivables/domain/types/receivableProviderPayment.types.js';
import { PrismaReceivableRepository } from '../src/modules/receivables/infrastructure/repositories/prismaReceivable.repository.js';
import { PrismaReceivableProviderPaymentRepository } from '../src/modules/receivables/infrastructure/transactions/prismaReceivableProviderPaymentRepository.js';

const url = process.env.PAYMENT_INTEGRATION_DATABASE_URL;
const suite = url === undefined ? describe.skip : describe;

function disposableDatabaseUrl(): string {
  if (!url) throw new Error('Missing dedicated payment integration database URL');
  const parsed = new URL(url);

  // Never read DATABASE_URL or write fixtures to a deployment database.
  if (
    parsed.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.pathname !== '/bom_trato_ci' ||
    parsed.username !== 'bom_trato_ci' ||
    parsed.searchParams.get('schema') !== 'public'
  ) {
    throw new Error('Payment integration tests require the disposable local bom_trato_ci database');
  }

  return url;
}

suite('provider payment ledger (disposable PostgreSQL)', () => {
  let prisma: PrismaService;
  let useCase: ConfirmReceivableProviderPaymentUseCase;
  const organizations: string[] = [];
  const users: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService({ url: disposableDatabaseUrl() });
    await prisma.$connect();
    useCase = new ConfirmReceivableProviderPaymentUseCase(new PrismaReceivableProviderPaymentRepository(prisma));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (!prisma) return;

    // Delete only this suite's UUID-scoped fixtures, in foreign-key order.
    for (const organizationId of organizations.splice(0)) {
      await prisma.receivableProviderCharge.deleteMany({ where: { organizationId } });
      await prisma.receivablePayment.deleteMany({ where: { receivable: { organizationId } } });
      await prisma.receivable.deleteMany({ where: { organizationId } });
      await prisma.workOrder.deleteMany({ where: { organizationId } });
      await prisma.quote.deleteMany({ where: { organizationId } });
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.organizationTrial.deleteMany({ where: { organizationId } });
      await prisma.organizationMember.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function fixture() {
    const now = new Date();
    const user = await prisma.user.create({
      data: { name: 'Fixture owner', email: randomUUID() + '@example.invalid', emailVerifiedAt: now },
    });
    users.push(user.id);
    const organization = await prisma.organization.create({
      data: { name: 'Fixture organization', ownerId: user.id, setupCompletedAt: now },
    });
    organizations.push(organization.id);
    await prisma.organizationMember.create({
      data: { organizationId: organization.id, userId: user.id, role: 'OWNER' },
    });
    await prisma.organizationTrial.create({
      data: {
        organizationId: organization.id,
        ownerId: user.id,
        startsAt: new Date(now.getTime() - 60_000),
        expiresAt: new Date(now.getTime() + 86_400_000),
      },
    });
    const customer = await prisma.customer.create({
      data: { organizationId: organization.id, name: 'Fixture customer' },
    });
    const snapshot = {
      organizationId: organization.id,
      customerId: customer.id,
      customerName: customer.name,
      title: 'Fixture service',
      currency: 'brl',
      createdById: user.id,
      updatedById: user.id,
    };
    const totals = { subtotalInCents: 10_000, discountInCents: 0, totalInCents: 10_000 };
    const quote = await prisma.quote.create({
      data: { ...snapshot, ...totals, status: 'APPROVED', sentAt: now, decidedAt: now },
    });
    const workOrder = await prisma.workOrder.create({
      data: { ...snapshot, ...totals, quoteId: quote.id },
    });
    const receivable = await prisma.receivable.create({
      data: { ...snapshot, workOrderId: workOrder.id, amountInCents: 10_000, dueAt: now },
    });
    const actor = { organizationId: organization.id, userId: user.id, receivableId: receivable.id };
    const registration: RegisterProviderChargeInput = {
      provider: 'fixture-provider',
      externalAccountId: randomUUID(),
      externalPaymentId: randomUUID(),
      liveMode: true,
      expectedAmountInCents: receivable.amountInCents,
      receivableVersion: receivable.version,
    };
    const payment: VerifiedProviderPayment = {
      provider: registration.provider,
      externalAccountId: registration.externalAccountId,
      externalPaymentId: registration.externalPaymentId,
      liveMode: true,
      eventId: randomUUID(),
      currency: 'brl',
      amountInCents: registration.expectedAmountInCents,
      paidAt: now,
    };
    return { actor, registration, payment, receivable };
  }

  async function ledger(receivableId: string) {
    const receivable = await prisma.receivable.findUniqueOrThrow({ where: { id: receivableId } });
    const payments = await prisma.receivablePayment.findMany({ where: { receivableId } });
    return { receivable, payments };
  }

  it('commits one ledger entry and one version advance despite concurrent duplicate delivery', async () => {
    const { actor, registration, payment, receivable } = await fixture();
    const chargeId = await useCase.register(actor, registration);
    expect(await useCase.register(actor, registration)).toBe(chargeId);

    const results = await Promise.all([
      useCase.execute(payment),
      useCase.execute({ ...payment, eventId: randomUUID() }),
    ]);

    expect(results.sort()).toEqual(['APPLIED', 'DUPLICATE']);
    const state = await ledger(receivable.id);
    expect(state.receivable).toMatchObject({ receivedInCents: 10_000, status: 'PAID', version: 2 });
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0]).toMatchObject({ amountInCents: 10_000, method: 'PIX', requestId: chargeId });
    expect(await prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id: chargeId } }))
      .toMatchObject({ paymentId: state.payments[0]?.id, confirmedAmountInCents: 10_000, confirmedCurrency: 'brl' });
  }, 30_000);

  it('rejects test registration and ignores test confirmations, even with a live identity', async () => {
    const { actor, registration, payment, receivable } = await fixture();
    await expect(useCase.register(actor, { ...registration, liveMode: false })).rejects.toThrow('INVALID_RECEIVABLE_INPUT');
    expect(await prisma.receivableProviderCharge.count({ where: { receivableId: receivable.id } })).toBe(0);
    await useCase.register(actor, registration);
    expect(await useCase.execute({ ...payment, liveMode: false })).toBe('IGNORED_TEST');
    expect(await useCase.execute({ ...payment, externalAccountId: randomUUID() })).toBe('UNMATCHED');
    expect(await ledger(receivable.id)).toMatchObject({
      receivable: { receivedInCents: 0, status: 'OPEN', version: 1 }, payments: [],
    });
  });

  it('does not let a second organization reuse an existing provider identity', async () => {
    const first = await fixture();
    const second = await fixture();
    await useCase.register(first.actor, first.registration);
    await expect(useCase.register(second.actor, first.registration)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(await useCase.execute(first.payment)).toBe('APPLIED');
    expect(await ledger(second.receivable.id)).toMatchObject({
      receivable: { receivedInCents: 0, status: 'OPEN', version: 1 }, payments: [],
    });
  });

  it('preserves review after a mismatched amount or a changed receivable', async () => {
    const first = await fixture();
    const firstCharge = await useCase.register(first.actor, first.registration);
    const wrong = { ...first.payment, amountInCents: 9_999 };
    expect(await useCase.execute(wrong)).toBe('REVIEW_REQUIRED');
    expect(await useCase.execute(first.payment)).toBe('REVIEW_REQUIRED');
    expect(await prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id: firstCharge } }))
      .toMatchObject({ reviewReason: 'AMOUNT_MISMATCH', confirmedEventId: wrong.eventId, confirmedAmountInCents: 9_999 });

    const second = await fixture();
    const secondCharge = await useCase.register(second.actor, second.registration);
    await prisma.receivable.update({ where: { id: second.receivable.id }, data: { version: 2, notes: 'Changed before settlement' } });
    expect(await useCase.execute(second.payment)).toBe('REVIEW_REQUIRED');
    expect(await prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id: secondCharge } }))
      .toMatchObject({ reviewReason: 'RECEIVABLE_CHANGED', paymentId: null });
    expect((await ledger(first.receivable.id)).payments).toHaveLength(0);
    expect((await ledger(second.receivable.id)).payments).toHaveLength(0);
  });

  it('rolls back the balance/version update when creating the ledger payment fails, then safely retries', async () => {
    const { actor, registration, payment, receivable } = await fixture();
    const chargeId = await useCase.register(actor, registration);
    const failure = vi.spyOn(PrismaReceivableRepository.prototype, 'createPayment')
      .mockRejectedValueOnce(new Error('Injected failure after aggregate save'));

    await expect(useCase.execute(payment)).rejects.toThrow('Injected failure');
    failure.mockRestore();
    expect(await ledger(receivable.id)).toMatchObject({
      receivable: { receivedInCents: 0, status: 'OPEN', version: 1 }, payments: [],
    });
    expect(await prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id: chargeId } }))
      .toMatchObject({ paymentId: null, confirmedEventId: null });
    expect(await useCase.execute(payment)).toBe('APPLIED');
    expect((await ledger(receivable.id)).payments).toHaveLength(1);
  });

  it('records a verified settlement after subscription access expires, but never after ownership changes', async () => {
    const first = await fixture();
    await useCase.register(first.actor, first.registration);
    await prisma.organizationTrial.update({
      where: { organizationId: first.actor.organizationId }, data: { revokedAt: new Date() },
    });
    expect(await useCase.execute(first.payment)).toBe('APPLIED');

    const second = await fixture();
    const secondCharge = await useCase.register(second.actor, second.registration);
    const newOwner = await prisma.user.create({
      data: { name: 'Fixture successor', email: randomUUID() + '@example.invalid', emailVerifiedAt: new Date() },
    });
    users.push(newOwner.id);
    await prisma.organization.update({ where: { id: second.actor.organizationId }, data: { ownerId: newOwner.id } });
    expect(await useCase.execute(second.payment)).toBe('REVIEW_REQUIRED');
    expect(await prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id: secondCharge } }))
      .toMatchObject({ reviewReason: 'OWNER_CHANGED', paymentId: null });
    expect((await ledger(second.receivable.id)).payments).toHaveLength(0);
  });
});
