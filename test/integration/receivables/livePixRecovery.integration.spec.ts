import { expect, it, vi } from 'vitest';

import { PrismaReceivableRepository } from '../../../src/modules/receivables/infrastructure/repositories/prismaReceivable.repository.js';

import { createPaymentFixture, paymentIntegrationSuite } from './support/payment.fixture.js';

paymentIntegrationSuite('livePixRecovery (disposable PostgreSQL)', () => {
  const context = createPaymentFixture();

  it('only presents a pending live QR when the release switches and exact snapshot are valid', async () => {
    const { prisma, fixtureQr, liveFixture, liveReview } = context;

    const f = await liveFixture();
    const review = liveReview(f);
    const disabled = liveReview(f, false);

    expect(await disabled.read(f.actor)).toMatchObject({ canIssue: false, canRecover: false, copyAndPaste: null });
    expect(await review.read(f.actor)).toMatchObject({ canIssue: true, status: 'NOT_ISSUED' });

    await f.repository.issue(f.actor, f.input);

    expect(await review.read(f.actor)).toMatchObject({
      status: 'PENDING',
      copyAndPaste: fixtureQr(),
      canIssue: false,
      canRecover: true,
    });
    expect(await disabled.read(f.actor)).toMatchObject({ status: 'STALE', copyAndPaste: null, canRecover: false });

    await prisma.receivable.update({ where: { id: f.receivable.id }, data: { version: 2 } });

    expect(await review.read(f.actor)).toMatchObject({ status: 'STALE', copyAndPaste: null });
  });

  it('recovers an uncertain live creation by its immutable reference and settles once with a distinct audit record', async () => {
    const { prisma, fixture, liveFixture, liveReview, ledger } = context;

    const f = await liveFixture();
    f.create.mockRejectedValueOnce(new Error('fixture timeout'));

    const issued = await f.repository.issue(f.actor, f.input);

    expect(issued.providerChargeId).toBeNull();

    const review = liveReview(f);
    const search = vi.spyOn(f.runtime.requireEnabled().client, 'searchLivePix').mockImplementation(async (input) => {
      expect(input).toMatchObject({
        issuanceId: issued.issuanceId,
        accountId: f.accountId,
        amountInCents: 10_000,
        accessToken: 'fixture-access',
      });
      expect(
        await prisma.mercadoPagoLivePixRecovery.count({
          where: { issuanceId: issued.issuanceId, resultCode: 'IN_PROGRESS' },
        }),
      ).toBe(1);

      return {
        kind: 'FOUND',
        paymentId: f.paymentId,
        observation: {
          status: 'APPROVED',
          payment: {
            ...f.payment,
            provider: 'mercado-pago',
            externalAccountId: f.accountId,
            externalPaymentId: f.paymentId,
            eventId: input.eventId,
          },
        },
      };
    });

    const result = await review.recover(f.actor, { issuanceId: issued.issuanceId });

    expect(result).toMatchObject({
      status: 'SETTLED',
      paymentId: f.paymentId,
      copyAndPaste: null,
      lastRecoveryCode: 'LEDGER_APPLIED',
      canRecover: false,
    });

    const row = await prisma.mercadoPagoLivePix.findUniqueOrThrow({ where: { id: issued.issuanceId } });

    expect(row).toMatchObject({
      resultCode: 'UNCERTAIN_CREATION',
      providerChargeId: row.id,
      status: 'SETTLED',
    });
    expect(row.recoveredAt).toBeInstanceOf(Date);

    const attempt = await prisma.mercadoPagoLivePixRecovery.findFirstOrThrow({ where: { issuanceId: row.id } });

    expect(attempt).toMatchObject({ resultCode: 'LEDGER_APPLIED', paymentId: f.paymentId });
    expect(await prisma.mercadoPagoLiveWebhookEvent.count({ where: { clientId: f.clientId } })).toBe(0);
    expect((await ledger(f.receivable.id)).payments).toHaveLength(1);
    await expect(review.recover(f.actor, { issuanceId: row.id })).rejects.toThrow('MERCADO_PAGO_PIX_CONFLICT');
    expect(search).toHaveBeenCalledTimes(1);
    expect(f.create).toHaveBeenCalledTimes(1);
  });

  it('never treats an empty live search as permission to create another payment', async () => {
    const { fixture, liveFixture, liveReview, ledger } = context;

    const f = await liveFixture();
    f.create.mockRejectedValueOnce(new Error('fixture timeout'));

    const issued = await f.repository.issue(f.actor, f.input);
    vi.spyOn(f.runtime.requireEnabled().client, 'searchLivePix').mockResolvedValueOnce({ kind: 'NOT_FOUND' });

    const result = await liveReview(f).recover(f.actor, { issuanceId: issued.issuanceId });

    expect(result).toMatchObject({
      status: 'REVIEW_REQUIRED',
      paymentId: null,
      canIssue: false,
      lastRecoveryCode: 'NOT_FOUND',
    });
    expect(await f.repository.issue(f.actor, f.input)).toEqual(issued);
    expect(f.create).toHaveBeenCalledTimes(1);
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('rolls back recovery binding and audit completion when the ledger write fails', async () => {
    const { prisma, fixture, liveFixture, liveReview, ledger } = context;

    const f = await liveFixture();
    f.create.mockRejectedValueOnce(new Error('fixture timeout'));

    const issued = await f.repository.issue(f.actor, f.input);
    vi.spyOn(f.runtime.requireEnabled().client, 'searchLivePix').mockImplementation(async (input) => ({
      kind: 'FOUND',
      paymentId: f.paymentId,
      observation: {
        status: 'APPROVED',
        payment: {
          ...f.payment,
          provider: 'mercado-pago',
          externalAccountId: f.accountId,
          externalPaymentId: f.paymentId,
          eventId: input.eventId,
        },
      },
    }));
    const failure = vi
      .spyOn(PrismaReceivableRepository.prototype, 'createPayment')
      .mockRejectedValueOnce(new Error('recovery rollback'));

    await expect(liveReview(f).recover(f.actor, { issuanceId: issued.issuanceId })).rejects.toThrow(
      'recovery rollback',
    );

    failure.mockRestore();

    expect(await prisma.mercadoPagoLivePix.findUniqueOrThrow({ where: { id: issued.issuanceId } })).toMatchObject({
      externalPaymentId: null,
      providerChargeId: null,
      recoveredAt: null,
    });
    expect(
      await prisma.mercadoPagoLivePixRecovery.findFirstOrThrow({ where: { issuanceId: issued.issuanceId } }),
    ).toMatchObject({ resultCode: 'IN_PROGRESS', completedAt: null });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });
});
