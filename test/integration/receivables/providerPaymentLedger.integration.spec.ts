import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaReceivableRepository } from '../../../src/modules/receivables/infrastructure/repositories/prismaReceivable.repository.js';

import { createPaymentFixture, paymentIntegrationSuite } from './support/payment.fixture.js';

paymentIntegrationSuite('providerPaymentLedger (disposable PostgreSQL)', () => {
  const context = createPaymentFixture();

  it('commits one ledger entry and one version advance despite concurrent duplicate delivery', async () => {
    const { prisma, useCase, fixture, ledger } = context;

    const {
      actor,
      registration,
      payment,
      receivable
    } = await fixture();
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
      .toMatchObject({
        paymentId: state.payments[0]?.id,
        confirmedAmountInCents: 10_000,
        confirmedCurrency: 'brl'
      });
  }, 30_000);

  it('rejects test registration and ignores test confirmations, even with a live identity', async () => {
    const { prisma, useCase, fixture, ledger } = context;

    const {
      actor,
      registration,
      payment,
      receivable
    } = await fixture();

    await expect(useCase.register(actor, { ...registration, liveMode: false })).rejects.toThrow('INVALID_RECEIVABLE_INPUT');
    expect(await prisma.receivableProviderCharge.count({ where: { receivableId: receivable.id } })).toBe(0);

    await useCase.register(actor, registration);

    expect(await useCase.execute({ ...payment, liveMode: false })).toBe('IGNORED_TEST');
    expect(await useCase.execute({ ...payment, externalAccountId: randomUUID() })).toBe('UNMATCHED');
    expect(await ledger(receivable.id)).toMatchObject({
      receivable: { receivedInCents: 0, status: 'OPEN', version: 1 },
      payments: [],
    });
  });

  it('does not let a second organization reuse an existing provider identity', async () => {
    const { useCase, fixture, ledger } = context;

    const first = await fixture();
    const second = await fixture();
    await useCase.register(first.actor, first.registration);

    await expect(useCase.register(second.actor, first.registration)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(await useCase.execute(first.payment)).toBe('APPLIED');
    expect(await ledger(second.receivable.id)).toMatchObject({
      receivable: { receivedInCents: 0, status: 'OPEN', version: 1 },
      payments: [],
    });
  });

  it('preserves review after a mismatched amount or a changed receivable', async () => {
    const { prisma, useCase, fixture, ledger } = context;

    const first = await fixture();
    const firstCharge = await useCase.register(first.actor, first.registration);
    const wrong = { ...first.payment, amountInCents: 9_999 };

    expect(await useCase.execute(wrong)).toBe('REVIEW_REQUIRED');
    expect(await useCase.execute(first.payment)).toBe('REVIEW_REQUIRED');
    expect(await prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id: firstCharge } }))
      .toMatchObject({
        reviewReason: 'AMOUNT_MISMATCH',
        confirmedEventId: wrong.eventId,
        confirmedAmountInCents: 9_999
      });

    const second = await fixture();
    const secondCharge = await useCase.register(second.actor, second.registration);
    await prisma.receivable.update({
      where: { id: second.receivable.id },
      data: {
        version: 2,
        notes: 'Changed before settlement'
      }
    });

    expect(await useCase.execute(second.payment)).toBe('REVIEW_REQUIRED');
    expect(await prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id: secondCharge } }))
      .toMatchObject({ reviewReason: 'RECEIVABLE_CHANGED', paymentId: null });
    expect((await ledger(first.receivable.id)).payments).toHaveLength(0);
    expect((await ledger(second.receivable.id)).payments).toHaveLength(0);
  });

  it('rolls back the balance/version update when creating the ledger payment fails, then safely retries', async () => {
    const { prisma, useCase, fixture, ledger } = context;

    const {
      actor,
      registration,
      payment,
      receivable
    } = await fixture();
    const chargeId = await useCase.register(actor, registration);
    const failure = vi.spyOn(PrismaReceivableRepository.prototype, 'createPayment')
      .mockRejectedValueOnce(new Error('Injected failure after aggregate save'));

    await expect(useCase.execute(payment)).rejects.toThrow('Injected failure');

    failure.mockRestore();

    expect(await ledger(receivable.id)).toMatchObject({
      receivable: { receivedInCents: 0, status: 'OPEN', version: 1 },
      payments: [],
    });
    expect(await prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id: chargeId } }))
      .toMatchObject({ paymentId: null, confirmedEventId: null });
    expect(await useCase.execute(payment)).toBe('APPLIED');
    expect((await ledger(receivable.id)).payments).toHaveLength(1);
  });

  it('records a verified settlement after subscription access expires, but never after ownership changes', async () => {
    const {
      prisma,
      useCase,
      users,
      fixture,
      ledger
    } = context;

    const first = await fixture();
    await useCase.register(first.actor, first.registration);
    await prisma.organizationTrial.update({
      where: { organizationId: first.actor.organizationId },
      data: { revokedAt: new Date() },
    });

    expect(await useCase.execute(first.payment)).toBe('APPLIED');

    const second = await fixture();
    const secondCharge = await useCase.register(second.actor, second.registration);
    const newOwner = await prisma.user.create({
      data: {
        name: 'Fixture successor',
        email: randomUUID() + '@example.invalid',
        emailVerifiedAt: new Date()
      },
    });
    users.push(newOwner.id);

    await prisma.organization.update({ where: { id: second.actor.organizationId }, data: { ownerId: newOwner.id } });

    expect(await useCase.execute(second.payment)).toBe('REVIEW_REQUIRED');
    expect(await prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id: secondCharge } }))
      .toMatchObject({ reviewReason: 'OWNER_CHANGED', paymentId: null });
    expect((await ledger(second.receivable.id)).payments).toHaveLength(0);
  });
  it('refuses to register a provider charge against another tenant receivable', async () => {
    const first = await context.fixture();
    const second = await context.fixture();
    const actor = { ...first.actor, receivableId: second.receivable.id };

    await expect(context.useCase.register(actor, first.registration)).rejects.toThrow('RECEIVABLE_NOT_FOUND');
    expect(await context.prisma.receivableProviderCharge.count({ where: { receivableId: second.receivable.id } })).toBe(0);
  });

  it('rejects a stale version or a mismatched outstanding amount without registering a charge', async () => {
    const f = await context.fixture();

    await expect(context.useCase.register(f.actor, { ...f.registration, receivableVersion: 2 }))
      .rejects.toThrow('RECEIVABLE_VERSION_CONFLICT');
    await expect(context.useCase.register(f.actor, { ...f.registration, expectedAmountInCents: 9999 }))
      .rejects.toThrow('INVALID_RECEIVABLE_INPUT');
    expect(await context.prisma.receivableProviderCharge.count({ where: { receivableId: f.receivable.id } })).toBe(0);
  });

  it.each([{ receivableVersion: 2 }, { expectedAmountInCents: 9999 }])('rejects changed data under the original provider identity', async (patch) => {
    const f = await context.fixture();
    const id = await context.useCase.register(f.actor, f.registration);

    await expect(context.useCase.register(f.actor, { ...f.registration, ...patch })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(await context.prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id } }))
      .toMatchObject({ expectedAmountInCents: f.registration.expectedAmountInCents, receivableVersion: f.registration.receivableVersion });
  });

  it('retains a currency mismatch as sticky review without touching the ledger', async () => {
    const f = await context.fixture();
    const id = await context.useCase.register(f.actor, f.registration);
    const wrong = { ...f.payment, currency: 'usd' };

    expect(await context.useCase.execute(wrong)).toBe('REVIEW_REQUIRED');
    expect(await context.useCase.execute(f.payment)).toBe('REVIEW_REQUIRED');
    expect(await context.prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id } }))
      .toMatchObject({ reviewReason: 'CURRENCY_MISMATCH', confirmedCurrency: 'usd', confirmedEventId: wrong.eventId, paymentId: null });
    expect((await context.ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('rejects a future payment date without consuming the valid provider registration', async () => {
    const f = await context.fixture();
    const id = await context.useCase.register(f.actor, f.registration);

    await expect(context.useCase.execute({ ...f.payment, paidAt: new Date(Date.now() + 60_000) }))
      .rejects.toThrow('INVALID_PAYMENT_DATE');
    expect(await context.prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id } }))
      .toMatchObject({ confirmedEventId: null, paymentId: null, reviewReason: null });
    expect(await context.useCase.execute(f.payment)).toBe('APPLIED');
    expect((await context.ledger(f.receivable.id)).payments).toHaveLength(1);
  });

  it('does not allow a generic Mercado Pago confirmation to bypass the durable live inbox', async () => {
    const f = await context.fixture();
    const registration = { ...f.registration, provider: 'mercado-pago' };
    const id = await context.useCase.register(f.actor, registration);

    expect(await context.useCase.execute({ ...f.payment, provider: registration.provider })).toBe('UNMATCHED');
    expect(await context.prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id } }))
      .toMatchObject({ confirmedEventId: null, paymentId: null, reviewReason: null });
    expect((await context.ledger(f.receivable.id)).payments).toHaveLength(0);
  });
});
