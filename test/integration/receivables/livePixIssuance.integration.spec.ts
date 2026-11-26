import { expect, it } from 'vitest';

import { createPaymentFixture, paymentIntegrationSuite } from './support/payment.fixture.js';

paymentIntegrationSuite('livePixIssuance (disposable PostgreSQL)', () => {
  const context = createPaymentFixture();

  it('reserves exactly once and atomically binds a live Pix without recording a ledger payment', async () => {
    const {
      prisma,
      useCase,
      fixtureQr,
      liveFixture,
      ledger
    } = context;

    const f = await liveFixture();
    const results = await Promise.all([
      f.repository.issue(f.actor, f.input),
      f.repository.issue(f.actor, f.input),
    ]);

    expect(f.create).toHaveBeenCalledTimes(1);
    expect(results[0].issuanceId).toBe(results[1].issuanceId);

    const row = await prisma.mercadoPagoLivePix.findUniqueOrThrow({ where: { id: results[0].issuanceId } });

    expect(row).toMatchObject({
      status: 'PENDING',
      resultCode: 'VERIFIED_PENDING',
      externalPaymentId: f.paymentId,
      providerChargeId: row.id,
      amountInCents: 10_000,
    });
    expect(row.copyAndPasteCiphertext).not.toBeNull();
    expect(row.copyAndPasteCiphertext).not.toContain(fixtureQr());

    const charge = await prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id: row.id } });

    expect(charge).toMatchObject({
      provider: 'mercado-pago',
      externalAccountId: f.accountId,
      externalPaymentId: f.paymentId,
      organizationId: f.actor.organizationId,
      receivableId: f.receivable.id,
      receivableVersion: 1,
      expectedAmountInCents: 10_000,
      paymentId: null,
      confirmedEventId: null,
    });
    expect(await f.repository.issue(f.actor, f.input)).toEqual({
      issuanceId: row.id,
      providerChargeId: row.id,
      status: 'PENDING',
    });
    expect(f.create).toHaveBeenCalledTimes(1);
    await expect(useCase.register(f.actor, f.registration)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(await ledger(f.receivable.id)).toMatchObject({
      receivable: { receivedInCents: 0, status: 'OPEN', version: 1 },
      payments: [],
    });
  }, 30_000);

  it('fails closed when live issuance is disabled or the version is outdated', async () => {
    const { prisma, liveFixture } = context;

    const disabled = await liveFixture(false);

    await expect(disabled.repository.issue(disabled.actor, disabled.input)).rejects.toThrow('MERCADO_PAGO_UNAVAILABLE');
    expect(disabled.credentialAccess).not.toHaveBeenCalled();
    expect(disabled.create).not.toHaveBeenCalled();

    const outdated = await liveFixture();

    await expect(outdated.repository.issue(outdated.actor, { ...outdated.input, version: 2 }))
      .rejects.toThrow('MERCADO_PAGO_PIX_CONFLICT');
    expect(outdated.create).not.toHaveBeenCalled();
    expect(await prisma.mercadoPagoLivePix.count({ where: { receivableId: outdated.receivable.id } })).toBe(0);
  });

  it('enforces the pilot organization, seller and amount limit before provider creation', async () => {
    const {
      prisma,
      fixture,
      liveFixture,
      liveReview
    } = context;

    const f = await liveFixture();
    const other = await liveFixture();

    expect(f.runtime.livePixAllowed(other.actor.organizationId)).toBe(false);
    await expect(f.repository.issue(other.actor, other.input)).rejects.toThrow('MERCADO_PAGO_UNAVAILABLE');
    expect(f.credentialAccess).not.toHaveBeenCalled();

    f.credentialAccess.mockResolvedValueOnce({
      accountId: other.accountId,
      accessToken: 'fixture-access',
      liveMode: true,
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    await expect(f.repository.issue(f.actor, f.input)).rejects.toThrow('MERCADO_PAGO_PIX_CONFLICT');

    await prisma.receivable.update({ where: { id: f.receivable.id }, data: { amountInCents: 10_001 } });

    expect(await liveReview(f).read(f.actor)).toMatchObject({ canIssue: false });
    await expect(f.repository.issue(f.actor, f.input)).rejects.toThrow('MERCADO_PAGO_PIX_CONFLICT');
    expect(f.create).not.toHaveBeenCalled();
    expect(await prisma.mercadoPagoLivePix.count({ where: { organizationId: f.actor.organizationId } })).toBe(0);
  });

  it('permits only one unresolved reservation per pilot organization', async () => {
    const {
      prisma,
      fixture,
      liveFixture,
      liveReview
    } = context;

    const f = await liveFixture();
    const now = new Date();
    const snapshot = {
      organizationId: f.actor.organizationId,
      customerId: f.receivable.customerId,
      customerName: f.receivable.customerName,
      title: 'Second fixture service',
      currency: 'brl',
      createdById: f.actor.userId,
      updatedById: f.actor.userId,
    };
    const totals = { subtotalInCents: 10_000, discountInCents: 0, totalInCents: 10_000 };

    const quote = await prisma.quote.create({
      data: {
        ...snapshot,
        ...totals,
        status: 'APPROVED',
        sentAt: now,
        decidedAt: now
      },
    });
    const order = await prisma.workOrder.create({ data: { ...snapshot, ...totals, quoteId: quote.id } });
    const second = await prisma.receivable.create({
      data: {
        ...snapshot,
        workOrderId: order.id,
        amountInCents: 10_000,
        dueAt: now
      },
    });
    const actor = { ...f.actor, receivableId: second.id };

    await f.repository.issue(f.actor, f.input);

    expect(await liveReview(f).read(actor)).toMatchObject({ canIssue: false, issuanceId: null });
    await expect(f.repository.issue(actor, {
      ...f.input,
      version: second.version
    })).rejects.toThrow('MERCADO_PAGO_PIX_CONFLICT');
    expect(f.create).toHaveBeenCalledTimes(1);
  });

  it('preserves uncertain live creation and never sends a second POST', async () => {
    const {
      prisma,
      fixture,
      liveFixture,
      ledger
    } = context;

    const f = await liveFixture();
    f.create.mockRejectedValueOnce(new Error('fixture timeout'));

    const result = await f.repository.issue(f.actor, f.input);

    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.providerChargeId).toBeNull();
    expect(await f.repository.issue(f.actor, f.input)).toEqual(result);
    expect(f.create).toHaveBeenCalledTimes(1);

    const row = await prisma.mercadoPagoLivePix.findUniqueOrThrow({ where: { id: result.issuanceId } });

    expect(row).toMatchObject({
      resultCode: 'UNCERTAIN_CREATION',
      externalPaymentId: null,
      copyAndPasteCiphertext: null,
    });
    expect(await prisma.receivableProviderCharge.count({ where: { receivableId: f.receivable.id } })).toBe(0);
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('retains verified identity but hides the QR when the receivable changed during provider I/O', async () => {
    const {
      prisma,
      useCase,
      fixtureQr,
      liveFixture,
      ledger
    } = context;

    const f = await liveFixture();
    f.create.mockImplementationOnce(async (input) => {
      await prisma.receivable.update({
        where: { id: f.receivable.id },
        data: { version: 2, notes: 'Changed during create' },
      });

      return {
        kind: 'PENDING',
        paymentId: f.paymentId,
        accountId: f.accountId,
        issuanceId: input.issuanceId,
        amountInCents: input.amountInCents,
        currency: 'brl',
        liveMode: true,
        copyAndPaste: fixtureQr(),
        expiresAt: input.expiresAt,
      };
    });

    const result = await f.repository.issue(f.actor, f.input);

    expect(result.status).toBe('REVIEW_REQUIRED');

    const row = await prisma.mercadoPagoLivePix.findUniqueOrThrow({ where: { id: result.issuanceId } });

    expect(row).toMatchObject({
      resultCode: 'SNAPSHOT_CHANGED',
      externalPaymentId: f.paymentId,
      providerChargeId: row.id,
      copyAndPasteCiphertext: null,
      expiresAt: null,
    });
    expect(await useCase.execute({
      ...f.payment,
      provider: 'mercado-pago',
      externalAccountId: f.accountId,
      externalPaymentId: f.paymentId,
    })).toBe('REVIEW_REQUIRED');
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('refuses a second live issuance when another provider charge already exists', async () => {
    const { useCase, liveFixture } = context;

    const f = await liveFixture();
    await useCase.register(f.actor, f.registration);

    await expect(f.repository.issue(f.actor, f.input)).rejects.toThrow('MERCADO_PAGO_PIX_CONFLICT');
    expect(f.create).not.toHaveBeenCalled();
  });
});
