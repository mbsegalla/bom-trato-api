import 'reflect-metadata';

import { createHash, randomInt, randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { ConfirmReceivableProviderPaymentUseCase } from '../src/modules/receivables/application/useCases/confirmReceivableProviderPayment.useCase.js';
import type { RegisterProviderChargeInput, VerifiedProviderPayment } from '../src/modules/receivables/domain/types/receivableProviderPayment.types.js';
import { pixCrc16 } from '../src/modules/receivables/domain/policies/receivablePixCharge.policy.js';
import { MercadoPagoConnectionRuntime } from '../src/modules/receivables/infrastructure/providers/mercadoPago/mercadoPagoConnectionRuntime.js';
import { PrismaReceivableRepository } from '../src/modules/receivables/infrastructure/repositories/prismaReceivable.repository.js';
import { MercadoPagoCredentialService } from '../src/modules/receivables/infrastructure/transactions/mercadoPagoCredentialService.js';
import { PrismaMercadoPagoLivePixRepository } from '../src/modules/receivables/infrastructure/transactions/prismaMercadoPagoLivePixRepository.js';
import { PrismaMercadoPagoLivePixReviewRepository } from '../src/modules/receivables/infrastructure/transactions/prismaMercadoPagoLivePixReviewRepository.js';
import { PrismaMercadoPagoLiveWebhookRepository } from '../src/modules/receivables/infrastructure/transactions/prismaMercadoPagoLiveWebhookRepository.js';
import { PrismaMercadoPagoWebhookRepository } from '../src/modules/receivables/infrastructure/transactions/prismaMercadoPagoWebhookRepository.js';
import { ProcessMercadoPagoLiveWebhookService } from '../src/modules/receivables/infrastructure/workers/processMercadoPagoLiveWebhook.service.js';
import type { ClaimedMercadoPagoWebhook } from '../src/modules/receivables/domain/types/mercadoPagoWebhook.types.js';
import { MercadoPagoError } from '../src/modules/receivables/infrastructure/providers/mercadoPago/mercadoPagoClient.js';
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
  const webhookClientIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService({ url: disposableDatabaseUrl() });
    await prisma.$connect();
    useCase = new ConfirmReceivableProviderPaymentUseCase(new PrismaReceivableProviderPaymentRepository(prisma));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (!prisma) return;

    const ids = webhookClientIds.splice(0);
    await prisma.mercadoPagoLiveWebhookEvent.deleteMany({ where: { clientId: { in: ids } } });
    await prisma.mercadoPagoWebhookEvent.deleteMany({ where: { clientId: { in: ids } } });

    // Delete only this suite's UUID-scoped fixtures, in foreign-key order.
    for (const organizationId of organizations.splice(0)) {
      await prisma.mercadoPagoLivePixRecovery.deleteMany({ where: { issuance: { organizationId } } });
      await prisma.mercadoPagoLivePix.deleteMany({ where: { organizationId } });
      await prisma.receivableProviderCharge.deleteMany({ where: { organizationId } });
      await prisma.receivablePayment.deleteMany({ where: { receivable: { organizationId } } });
      await prisma.receivable.deleteMany({ where: { organizationId } });
      await prisma.workOrder.deleteMany({ where: { organizationId } });
      await prisma.quote.deleteMany({ where: { organizationId } });
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.organizationTrial.deleteMany({ where: { organizationId } });
      await prisma.mercadoPagoConnection.deleteMany({ where: { organizationId } });
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

  function tlv(id: string, value: string): string {
    return id + String(value.length).padStart(2, '0') + value;
  }

  function fixtureQr(): string {
    const payload = [
      tlv('00', '01'), tlv('01', '12'), tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('25', 'example.invalid/test')),
      tlv('52', '0000'), tlv('53', '986'), tlv('54', '100.00'), tlv('58', 'BR'), tlv('59', 'TEST'),
      tlv('60', 'SAO PAULO'), tlv('62', tlv('05', '***')), '6304',
    ].join('');
    return payload + pixCrc16(payload);
  }

  async function liveFixture(livePixEnabled = true) {
    const setup = await fixture();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3_600_000);
    const session = await prisma.authSession.create({
      data: {
        userId: setup.actor.userId,
        lastRefreshedAt: now,
        idleExpiresAt: expiresAt,
        absoluteExpiresAt: expiresAt,
      },
    });
    const actor = { ...setup.actor, sessionId: session.id };
    const clientId = String(randomInt(1_000_000_000, 9_999_999_999));
    webhookClientIds.push(clientId);
    const accountId = String(randomInt(1_000_000_000, 9_999_999_999));
    const paymentId = String(randomInt(1_000_000_000, 9_999_999_999));
    const accessToken = 'fixture-access';
    const runtime = new MercadoPagoConnectionRuntime({
      enabled: true,
      liveMode: true,
      sandboxPixEnabled: false,
      livePixEnabled,
      livePilotOrganizationId: actor.organizationId,
      livePilotAccountId: accountId,
      livePilotMaxAmountInCents: 10_000,
      clientId,
      clientSecret: 'fixture-secret',
      encryptionKey: 'a'.repeat(64),
      redirectUri: 'https://example.invalid/mercado-pago/callback',
    });
    await prisma.mercadoPagoConnection.create({
      data: {
        organizationId: actor.organizationId,
        liveMode: true,
        clientId,
        accountId,
        connectedById: actor.userId,
        connectedAt: now,
        expiresAt,
        accessTokenCiphertext: runtime.cipher.seal(
          ['credential', actor.organizationId, clientId, 'true', accountId, 'access'], accessToken,
        ),
        refreshTokenCiphertext: runtime.cipher.seal(
          ['credential', actor.organizationId, clientId, 'true', accountId, 'refresh'], 'fixture-refresh',
        ),
      },
    });
    const credentials = new MercadoPagoCredentialService(prisma, runtime);
    const credentialAccess = vi.spyOn(credentials, 'accessForOwner').mockResolvedValue({
      accountId, accessToken, liveMode: true, expiresAt,
    });
    const create = vi.spyOn(runtime.requireEnabled().client, 'createLivePix').mockImplementation(async (input) => {
      // A distinct connection can only read a committed reservation.
      const reserved = await prisma.mercadoPagoLivePix.findUniqueOrThrow({ where: { id: input.issuanceId } });
      expect(reserved).toMatchObject({ status: 'RESERVED', organizationId: actor.organizationId, accountId });
      return {
        kind: 'PENDING', paymentId, accountId, issuanceId: input.issuanceId,
        amountInCents: input.amountInCents, currency: 'brl', liveMode: true,
        copyAndPaste: fixtureQr(), expiresAt: input.expiresAt,
      };
    });
    const repository = new PrismaMercadoPagoLivePixRepository(prisma, runtime, credentials);
    const input = {
      version: setup.receivable.version,
      buyerEmail: 'fixture@example.invalid',
      buyerDocumentType: 'CPF' as const,
      buyerDocumentNumber: '19119119100',
      confirmed: true,
    };
    return { ...setup, actor, repository, credentials, credentialAccess, create, input, clientId, accountId, paymentId, runtime };
  }

  function liveReview(f: Awaited<ReturnType<typeof liveFixture>>, workerEnabled = true) {
    return new PrismaMercadoPagoLivePixReviewRepository(prisma, f.runtime, f.credentials, {
      enabled: workerEnabled,
      workerEnabled,
      clientId: f.clientId,
      secret: 'fixture-live-webhook-secret',
    });
  }

  async function settlementFixture() {
    const f = await liveFixture();
    const issuance = await f.repository.issue(f.actor, f.input);
    const inbox = new PrismaMercadoPagoLiveWebhookRepository(prisma, f.runtime);
    const sandbox = new PrismaMercadoPagoWebhookRepository(prisma, f.runtime);
    const processor = new ProcessMercadoPagoLiveWebhookService(inbox, f.runtime);
    const approval = (eventId: string): VerifiedProviderPayment => ({
      ...f.payment,
      provider: 'mercado-pago',
      externalAccountId: f.accountId,
      externalPaymentId: f.paymentId,
      eventId,
      liveMode: true,
    });
    const read = vi.spyOn(f.runtime.requireEnabled().client, 'readLivePix').mockImplementation(async (input) => {
      expect(input).toMatchObject({
        issuanceId: issuance.issuanceId, accountId: f.accountId, paymentId: f.paymentId,
        amountInCents: 10_000, accessToken: 'fixture-access',
      });
      return { status: 'APPROVED', payment: approval(input.eventId) };
    });
    function notice(paymentId = f.paymentId) {
      return {
        clientId: f.clientId,
        deliveryKey: createHash('sha256').update(randomUUID()).digest('hex'),
        paymentId,
        requestId: randomUUID(),
        signedAt: new Date(),
      };
    }
    async function claim(): Promise<ClaimedMercadoPagoWebhook> {
      const job = await inbox.claim(f.clientId, randomUUID());
      if (job === null) throw new Error('Fixture live event was not claimed');
      return job;
    }
    async function delivery() {
      const event = notice();
      await inbox.enqueue(event);
      const job = await claim();
      expect(job.deliveryKey).toBe(event.deliveryKey);
      return job;
    }
    function stored(job: ClaimedMercadoPagoWebhook) {
      return prisma.mercadoPagoLiveWebhookEvent.findUniqueOrThrow({
        where: { clientId_deliveryKey: { clientId: job.clientId, deliveryKey: job.deliveryKey } },
      });
    }
    function issuanceRow() {
      return prisma.mercadoPagoLivePix.findUniqueOrThrow({ where: { id: issuance.issuanceId } });
    }
    return { ...f, issuance, inbox, sandbox, processor, read, approval, notice, claim, delivery, stored, issuanceRow };
  }

  async function ledger(receivableId: string) {
    const receivable = await prisma.receivable.findUniqueOrThrow({ where: { id: receivableId } });
    const payments = await prisma.receivablePayment.findMany({ where: { receivableId } });
    return { receivable, payments };
  }

  it('reserves exactly once and atomically binds a live Pix without recording a ledger payment', async () => {
    const f = await liveFixture();
    const results = await Promise.all([
      f.repository.issue(f.actor, f.input),
      f.repository.issue(f.actor, f.input),
    ]);
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(results[0].issuanceId).toBe(results[1].issuanceId);
    const row = await prisma.mercadoPagoLivePix.findUniqueOrThrow({ where: { id: results[0].issuanceId } });
    expect(row).toMatchObject({
      status: 'PENDING', resultCode: 'VERIFIED_PENDING', externalPaymentId: f.paymentId,
      providerChargeId: row.id, amountInCents: 10_000,
    });
    expect(row.copyAndPasteCiphertext).not.toBeNull();
    expect(row.copyAndPasteCiphertext).not.toContain(fixtureQr());
    const charge = await prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id: row.id } });
    expect(charge).toMatchObject({
      provider: 'mercado-pago', externalAccountId: f.accountId, externalPaymentId: f.paymentId,
      organizationId: f.actor.organizationId, receivableId: f.receivable.id,
      receivableVersion: 1, expectedAmountInCents: 10_000, paymentId: null, confirmedEventId: null,
    });
    expect(await f.repository.issue(f.actor, f.input)).toEqual({
      issuanceId: row.id, providerChargeId: row.id, status: 'PENDING',
    });
    expect(f.create).toHaveBeenCalledTimes(1);
    await expect(useCase.register(f.actor, f.registration)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(await ledger(f.receivable.id)).toMatchObject({
      receivable: { receivedInCents: 0, status: 'OPEN', version: 1 }, payments: [],
    });
  }, 30_000);

  it('fails closed when live issuance is disabled or the version is outdated', async () => {
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
    const f = await liveFixture();
    const other = await liveFixture();
    expect(f.runtime.livePixAllowed(other.actor.organizationId)).toBe(false);
    await expect(f.repository.issue(other.actor, other.input)).rejects.toThrow('MERCADO_PAGO_UNAVAILABLE');
    expect(f.credentialAccess).not.toHaveBeenCalled();
    f.credentialAccess.mockResolvedValueOnce({
      accountId: other.accountId, accessToken: 'fixture-access', liveMode: true,
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
    const f = await liveFixture();
    const now = new Date();
    const snapshot = {
      organizationId: f.actor.organizationId, customerId: f.receivable.customerId,
      customerName: f.receivable.customerName, title: 'Second fixture service',
      currency: 'brl', createdById: f.actor.userId, updatedById: f.actor.userId,
    };
    const totals = { subtotalInCents: 10_000, discountInCents: 0, totalInCents: 10_000 };
    const quote = await prisma.quote.create({
      data: { ...snapshot, ...totals, status: 'APPROVED', sentAt: now, decidedAt: now },
    });
    const order = await prisma.workOrder.create({ data: { ...snapshot, ...totals, quoteId: quote.id } });
    const second = await prisma.receivable.create({
      data: { ...snapshot, workOrderId: order.id, amountInCents: 10_000, dueAt: now },
    });
    const actor = { ...f.actor, receivableId: second.id };
    await f.repository.issue(f.actor, f.input);
    expect(await liveReview(f).read(actor)).toMatchObject({ canIssue: false, issuanceId: null });
    await expect(f.repository.issue(actor, { ...f.input, version: second.version })).rejects.toThrow('MERCADO_PAGO_PIX_CONFLICT');
    expect(f.create).toHaveBeenCalledTimes(1);
  });

  it('preserves uncertain live creation and never sends a second POST', async () => {
    const f = await liveFixture();
    f.create.mockRejectedValueOnce(new Error('fixture timeout'));
    const result = await f.repository.issue(f.actor, f.input);
    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.providerChargeId).toBeNull();
    expect(await f.repository.issue(f.actor, f.input)).toEqual(result);
    expect(f.create).toHaveBeenCalledTimes(1);
    const row = await prisma.mercadoPagoLivePix.findUniqueOrThrow({ where: { id: result.issuanceId } });
    expect(row).toMatchObject({
      resultCode: 'UNCERTAIN_CREATION', externalPaymentId: null, copyAndPasteCiphertext: null,
    });
    expect(await prisma.receivableProviderCharge.count({ where: { receivableId: f.receivable.id } })).toBe(0);
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('retains verified identity but hides the QR when the receivable changed during provider I/O', async () => {
    const f = await liveFixture();
    f.create.mockImplementationOnce(async (input) => {
      await prisma.receivable.update({
        where: { id: f.receivable.id }, data: { version: 2, notes: 'Changed during create' },
      });
      return {
        kind: 'PENDING', paymentId: f.paymentId, accountId: f.accountId, issuanceId: input.issuanceId,
        amountInCents: input.amountInCents, currency: 'brl', liveMode: true,
        copyAndPaste: fixtureQr(), expiresAt: input.expiresAt,
      };
    });
    const result = await f.repository.issue(f.actor, f.input);
    expect(result.status).toBe('REVIEW_REQUIRED');
    const row = await prisma.mercadoPagoLivePix.findUniqueOrThrow({ where: { id: result.issuanceId } });
    expect(row).toMatchObject({
      resultCode: 'SNAPSHOT_CHANGED', externalPaymentId: f.paymentId, providerChargeId: row.id,
      copyAndPasteCiphertext: null, expiresAt: null,
    });
    expect(await useCase.execute({
      ...f.payment, provider: 'mercado-pago', externalAccountId: f.accountId, externalPaymentId: f.paymentId,
    })).toBe('REVIEW_REQUIRED');
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('refuses a second live issuance when another provider charge already exists', async () => {
    const f = await liveFixture();
    await useCase.register(f.actor, f.registration);
    await expect(f.repository.issue(f.actor, f.input)).rejects.toThrow('MERCADO_PAGO_PIX_CONFLICT');
    expect(f.create).not.toHaveBeenCalled();
  });

  it('only presents a pending live QR when the release switches and exact snapshot are valid', async () => {
    const f = await liveFixture();
    const review = liveReview(f);
    const disabled = liveReview(f, false);
    expect(await disabled.read(f.actor)).toMatchObject({ canIssue: false, canRecover: false, copyAndPaste: null });
    expect(await review.read(f.actor)).toMatchObject({ canIssue: true, status: 'NOT_ISSUED' });
    await f.repository.issue(f.actor, f.input);
    expect(await review.read(f.actor)).toMatchObject({
      status: 'PENDING', copyAndPaste: fixtureQr(), canIssue: false, canRecover: true,
    });
    expect(await disabled.read(f.actor)).toMatchObject({ status: 'STALE', copyAndPaste: null, canRecover: false });
    await prisma.receivable.update({ where: { id: f.receivable.id }, data: { version: 2 } });
    expect(await review.read(f.actor)).toMatchObject({ status: 'STALE', copyAndPaste: null });
  });

  it('recovers an uncertain live creation by its immutable reference and settles once with a distinct audit record', async () => {
    const f = await liveFixture();
    f.create.mockRejectedValueOnce(new Error('fixture timeout'));
    const issued = await f.repository.issue(f.actor, f.input);
    expect(issued.providerChargeId).toBeNull();
    const review = liveReview(f);
    const search = vi.spyOn(f.runtime.requireEnabled().client, 'searchLivePix').mockImplementation(async (input) => {
      expect(input).toMatchObject({
        issuanceId: issued.issuanceId, accountId: f.accountId, amountInCents: 10_000, accessToken: 'fixture-access',
      });
      expect(await prisma.mercadoPagoLivePixRecovery.count({
        where: { issuanceId: issued.issuanceId, resultCode: 'IN_PROGRESS' },
      })).toBe(1);
      return {
        kind: 'FOUND', paymentId: f.paymentId,
        observation: { status: 'APPROVED', payment: {
          ...f.payment, provider: 'mercado-pago', externalAccountId: f.accountId,
          externalPaymentId: f.paymentId, eventId: input.eventId,
        } },
      };
    });
    const result = await review.recover(f.actor, { issuanceId: issued.issuanceId });
    expect(result).toMatchObject({
      status: 'SETTLED', paymentId: f.paymentId, copyAndPaste: null, lastRecoveryCode: 'LEDGER_APPLIED', canRecover: false,
    });
    const row = await prisma.mercadoPagoLivePix.findUniqueOrThrow({ where: { id: issued.issuanceId } });
    expect(row).toMatchObject({ resultCode: 'UNCERTAIN_CREATION', providerChargeId: row.id, status: 'SETTLED' });
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
    const f = await liveFixture();
    f.create.mockRejectedValueOnce(new Error('fixture timeout'));
    const issued = await f.repository.issue(f.actor, f.input);
    vi.spyOn(f.runtime.requireEnabled().client, 'searchLivePix').mockResolvedValueOnce({ kind: 'NOT_FOUND' });
    const result = await liveReview(f).recover(f.actor, { issuanceId: issued.issuanceId });
    expect(result).toMatchObject({ status: 'REVIEW_REQUIRED', paymentId: null, canIssue: false, lastRecoveryCode: 'NOT_FOUND' });
    expect(await f.repository.issue(f.actor, f.input)).toEqual(issued);
    expect(f.create).toHaveBeenCalledTimes(1);
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('rolls back recovery binding and audit completion when the ledger write fails', async () => {
    const f = await liveFixture();
    f.create.mockRejectedValueOnce(new Error('fixture timeout'));
    const issued = await f.repository.issue(f.actor, f.input);
    vi.spyOn(f.runtime.requireEnabled().client, 'searchLivePix').mockImplementation(async (input) => ({
      kind: 'FOUND', paymentId: f.paymentId,
      observation: { status: 'APPROVED', payment: {
        ...f.payment, provider: 'mercado-pago', externalAccountId: f.accountId,
        externalPaymentId: f.paymentId, eventId: input.eventId,
      } },
    }));
    const failure = vi.spyOn(PrismaReceivableRepository.prototype, 'createPayment').mockRejectedValueOnce(new Error('recovery rollback'));
    await expect(liveReview(f).recover(f.actor, { issuanceId: issued.issuanceId })).rejects.toThrow('recovery rollback');
    failure.mockRestore();
    expect(await prisma.mercadoPagoLivePix.findUniqueOrThrow({ where: { id: issued.issuanceId } }))
      .toMatchObject({ externalPaymentId: null, providerChargeId: null, recoveredAt: null });
    expect(await prisma.mercadoPagoLivePixRecovery.findFirstOrThrow({ where: { issuanceId: issued.issuanceId } }))
      .toMatchObject({ resultCode: 'IN_PROGRESS', completedAt: null });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('processes only the live inbox and commits concurrent approvals exactly once', async () => {
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
      status: 'SETTLED', copyAndPasteCiphertext: null, expiresAt: null,
    });
    expect(await prisma.mercadoPagoWebhookEvent.count({ where: { clientId: f.clientId, processedAt: null } })).toBe(1);
  }, 30_000);

  it('does not commit a payment if the processing lease expired during provider I/O', async () => {
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
    const f = await settlementFixture();
    const job = await f.delivery();
    const failure = vi.spyOn(PrismaReceivableRepository.prototype, 'createPayment')
      .mockRejectedValueOnce(new Error('Injected live payment failure'));
    await expect(f.processor.execute(job)).rejects.toThrow('Injected live payment failure');
    failure.mockRestore();
    expect(await f.stored(job)).toMatchObject({ processedAt: null, reviewRequiredAt: null, attempts: 0 });
    expect(await f.issuanceRow()).toMatchObject({ status: 'PENDING' });
    expect(await ledger(f.receivable.id)).toMatchObject({
      receivable: { receivedInCents: 0, status: 'OPEN', version: 1 }, payments: [],
    });
    expect(await f.processor.execute(job)).toBe(true);
    expect(await f.stored(job)).toMatchObject({ resultCode: 'LEDGER_APPLIED', attempts: 1 });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(1);
  });

  it('retains a refund after settlement without automatically reversing or reapplying the ledger', async () => {
    const f = await settlementFixture();
    const approved = await f.delivery();
    expect(await f.processor.execute(approved)).toBe(true);
    const refund = await f.delivery();
    f.read.mockResolvedValueOnce({ status: 'REFUNDED' });
    expect(await f.processor.execute(refund)).toBe(true);
    expect(await f.stored(refund)).toMatchObject({ resultCode: 'VERIFIED_REFUNDED', processedAt: null });
    expect((await f.stored(refund)).reviewRequiredAt).toBeInstanceOf(Date);
    expect(await f.issuanceRow()).toMatchObject({
      status: 'REVIEW_REQUIRED', settlementReviewCode: 'VERIFIED_REFUNDED', copyAndPasteCiphertext: null,
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
    const f = await settlementFixture();
    const approval = await f.delivery();
    const prepared = await f.inbox.prepare(approval);
    if (prepared.kind !== 'READY') throw new Error('Fixture preparation failed');
    const refund = await f.delivery();
    f.read.mockResolvedValueOnce({ status: 'REFUNDED' });
    expect(await f.processor.execute(refund)).toBe(true);
    expect(await f.inbox.settle(approval, {
      kind: 'CHECKED', binding: prepared.binding, stamp: prepared.stamp,
      observation: { status: 'APPROVED', payment: f.approval(approval.deliveryKey) },
    })).toBe(true);
    expect(await f.stored(approval)).toMatchObject({ resultCode: 'ISSUANCE_REVIEW_REQUIRED' });
    expect(await useCase.execute(f.approval(approval.deliveryKey))).toBe('REVIEW_REQUIRED');
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('retains unknown identities and provider outages for retry, never trying another seller', async () => {
    const f = await settlementFixture();
    const unknown = f.notice('987654321');
    await f.inbox.enqueue(unknown);
    const missing = await f.claim();
    expect(await f.processor.execute(missing)).toBe(true);
    expect(f.read).not.toHaveBeenCalled();
    expect(await f.stored(missing)).toMatchObject({
      resultCode: 'UNMATCHED_PAYMENT', attempts: 1, processedAt: null, reviewRequiredAt: null,
    });
    const outage = await f.delivery();
    f.read.mockRejectedValueOnce(new MercadoPagoError('REQUEST_FAILED', 503));
    expect(await f.processor.execute(outage)).toBe(true);
    expect(await f.stored(outage)).toMatchObject({
      resultCode: 'PROVIDER_UNAVAILABLE', attempts: 1, processedAt: null, reviewRequiredAt: null,
    });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('refuses a sandbox or inconsistent approval even when the identifiers are otherwise correct', async () => {
    const f = await settlementFixture();
    const job = await f.delivery();
    f.read.mockResolvedValueOnce({ status: 'APPROVED', payment: { ...f.approval(job.deliveryKey), liveMode: false } });
    expect(await f.processor.execute(job)).toBe(true);
    expect(await f.stored(job)).toMatchObject({ resultCode: 'INVALID_PROVIDER_PAYMENT', processedAt: null });
    expect(await f.issuanceRow()).toMatchObject({
      status: 'REVIEW_REQUIRED', settlementReviewCode: 'INVALID_PROVIDER_PAYMENT',
    });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('retains a changed receivable for review and does not apply a stale settlement', async () => {
    const f = await settlementFixture();
    await prisma.receivable.update({
      where: { id: f.receivable.id }, data: { version: 2, notes: 'Changed after issuance' },
    });
    const job = await f.delivery();
    expect(await f.processor.execute(job)).toBe(true);
    expect(await f.stored(job)).toMatchObject({ resultCode: 'LEDGER_REVIEW_REQUIRED', processedAt: null });
    expect(await f.issuanceRow()).toMatchObject({
      status: 'REVIEW_REQUIRED', settlementReviewCode: 'LEDGER_REVIEW_REQUIRED',
    });
    expect(await prisma.receivableProviderCharge.findUniqueOrThrow({ where: { id: f.issuance.issuanceId } }))
      .toMatchObject({ reviewReason: 'RECEIVABLE_CHANGED', paymentId: null });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('records owner changes without consulting another seller token', async () => {
    const f = await settlementFixture();
    const successor = await prisma.user.create({
      data: { name: 'Fixture successor', email: randomUUID() + '@example.invalid', emailVerifiedAt: new Date() },
    });
    users.push(successor.id);
    await prisma.organization.update({
      where: { id: f.actor.organizationId }, data: { ownerId: successor.id },
    });
    const job = await f.delivery();
    expect(await f.processor.execute(job)).toBe(true);
    expect(f.read).not.toHaveBeenCalled();
    expect(await f.stored(job)).toMatchObject({ resultCode: 'OWNER_CHANGED', processedAt: null });
    expect(await f.issuanceRow()).toMatchObject({ status: 'REVIEW_REQUIRED', settlementReviewCode: 'OWNER_CHANGED' });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('never reopens a closed issuance when a pending event arrives or auto-applies a late approval', async () => {
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
      status: 'REVIEW_REQUIRED', settlementReviewCode: 'APPROVAL_AFTER_CLOSURE',
    });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('rotates a still-valid offline credential for a bound delivery without a user session', async () => {
    const f = await settlementFixture();
    const key = { organizationId_liveMode: { organizationId: f.actor.organizationId, liveMode: true } };
    await prisma.mercadoPagoConnection.update({ where: key, data: { expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.authSession.update({ where: { id: f.actor.sessionId }, data: { revokedAt: new Date(), revocationReason: 'LOGOUT' } });
    const expiresAt = new Date(Date.now() + 3_600_000);
    const refresh = vi.spyOn(f.runtime.requireEnabled().client, 'refreshCredentials').mockImplementation(async (accountId, token) => {
      expect(accountId).toBe(f.accountId);
      expect(token).toBe('fixture-refresh');
      const row = await prisma.mercadoPagoConnection.findUniqueOrThrow({ where: key });
      expect(row.refreshClaimId).not.toBeNull();
      return { accountId, accessToken: 'fixture-rotated-access', refreshToken: 'fixture-rotated-refresh', expiresAt, liveMode: true };
    });
    f.read.mockImplementationOnce(async (input) => {
      expect(input.accessToken).toBe('fixture-rotated-access');
      return { status: 'APPROVED', payment: f.approval(input.eventId) };
    });
    const job = await f.delivery();
    expect(await f.processor.execute(job)).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await f.stored(job)).toMatchObject({ resultCode: 'LEDGER_APPLIED' });
    const row = await prisma.mercadoPagoConnection.findUniqueOrThrow({ where: key });
    expect(row).toMatchObject({ expiresAt, refreshClaimId: null, refreshStartedAt: null });
    expect(f.runtime.cipher.open(
      ['credential', f.actor.organizationId, f.clientId, 'true', f.accountId, 'refresh'],
      row.refreshTokenCiphertext!,
    )).toBe('fixture-rotated-refresh');
    expect((await ledger(f.receivable.id)).payments).toHaveLength(1);
  });

  it('retains an uncertain refresh claim and never repeats the possibly consumed grant', async () => {
    const f = await settlementFixture();
    const key = { organizationId_liveMode: { organizationId: f.actor.organizationId, liveMode: true } };
    await prisma.mercadoPagoConnection.update({ where: key, data: { expiresAt: new Date(Date.now() + 60_000) } });
    const refresh = vi.spyOn(f.runtime.requireEnabled().client, 'refreshCredentials').mockRejectedValue(new Error('fixture timeout'));
    const first = await f.delivery();
    expect(await f.processor.execute(first)).toBe(true);
    const claim = await prisma.mercadoPagoConnection.findUniqueOrThrow({ where: key });
    expect(claim.refreshClaimId).not.toBeNull();
    expect(await f.stored(first)).toMatchObject({ resultCode: 'CREDENTIAL_UNAVAILABLE', processedAt: null });
    const second = await f.delivery();
    expect(await f.processor.execute(second)).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(f.read).not.toHaveBeenCalled();
    expect((await ledger(f.receivable.id)).payments).toHaveLength(0);
    expect(await prisma.mercadoPagoConnection.findUniqueOrThrow({ where: key }))
      .toMatchObject({ refreshClaimId: claim.refreshClaimId });
  });

  it('never renews credentials for an unmatched delivery or an already expired token', async () => {
    const f = await settlementFixture();
    const key = { organizationId_liveMode: { organizationId: f.actor.organizationId, liveMode: true } };
    const refresh = vi.spyOn(f.runtime.requireEnabled().client, 'refreshCredentials').mockRejectedValue(new Error('unexpected refresh'));
    await prisma.mercadoPagoConnection.update({ where: key, data: { expiresAt: new Date(Date.now() + 60_000) } });
    await f.inbox.enqueue(f.notice('987654321'));
    const unmatched = await f.claim();
    expect(await f.processor.execute(unmatched)).toBe(true);
    expect(await f.stored(unmatched)).toMatchObject({ resultCode: 'UNMATCHED_PAYMENT' });
    await prisma.mercadoPagoConnection.update({ where: key, data: { expiresAt: new Date(Date.now() - 1000) } });
    const bound = await f.delivery();
    expect(await f.processor.execute(bound)).toBe(true);
    expect(await f.stored(bound)).toMatchObject({ resultCode: 'CREDENTIAL_UNAVAILABLE' });
    expect(refresh).not.toHaveBeenCalled();
    expect(f.read).not.toHaveBeenCalled();
  });

  it('continues settling an existing bound payment while new live issuance is switched off', async () => {
    const f = await settlementFixture();
    const runtime = new MercadoPagoConnectionRuntime({
      enabled: true, liveMode: true, sandboxPixEnabled: false, livePixEnabled: false,
      clientId: f.clientId, clientSecret: 'fixture-secret', encryptionKey: 'a'.repeat(64),
      redirectUri: 'https://example.invalid/mercado-pago/callback',
    });
    expect(runtime.livePixAvailable).toBe(false);
    const inbox = new PrismaMercadoPagoLiveWebhookRepository(prisma, runtime);
    const processor = new ProcessMercadoPagoLiveWebhookService(inbox, runtime);
    vi.spyOn(runtime.requireEnabled().client, 'readLivePix').mockImplementation(async (input) => ({
      status: 'APPROVED', payment: f.approval(input.eventId),
    }));
    const job = await f.delivery();
    expect(await processor.execute(job)).toBe(true);
    expect(await f.stored(job)).toMatchObject({ resultCode: 'LEDGER_APPLIED' });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(1);
  });

  it('still settles a valid live payment after subscription access expires', async () => {
    const f = await settlementFixture();
    await prisma.organizationTrial.update({
      where: { organizationId: f.actor.organizationId }, data: { revokedAt: new Date() },
    });
    const job = await f.delivery();
    expect(await f.processor.execute(job)).toBe(true);
    expect(await f.stored(job)).toMatchObject({ resultCode: 'LEDGER_APPLIED' });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(1);
  });

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
