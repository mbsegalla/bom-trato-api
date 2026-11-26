import 'reflect-metadata';

import { createHash, randomInt, randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, vi } from 'vitest';

import { PrismaService } from '../../../../src/infrastructure/database/prisma.service.js';
import { ConfirmReceivableProviderPaymentUseCase } from '../../../../src/modules/receivables/application/useCases/confirmReceivableProviderPayment.useCase.js';
import type {
  RegisterProviderChargeInput,
  VerifiedProviderPayment
} from '../../../../src/modules/receivables/domain/types/receivableProviderPayment.types.js';
import { pixCrc16 } from '../../../../src/modules/receivables/domain/policies/receivablePixCharge.policy.js';
import { MercadoPagoConnectionRuntime } from '../../../../src/modules/receivables/infrastructure/providers/mercadoPago/mercadoPagoConnectionRuntime.js';
import { MercadoPagoCredentialService } from '../../../../src/modules/receivables/infrastructure/transactions/mercadoPagoCredentialService.js';
import { PrismaMercadoPagoLivePixRepository } from '../../../../src/modules/receivables/infrastructure/transactions/prismaMercadoPagoLivePixRepository.js';
import { PrismaMercadoPagoLivePixReviewRepository } from '../../../../src/modules/receivables/infrastructure/transactions/prismaMercadoPagoLivePixReviewRepository.js';
import { PrismaMercadoPagoLiveWebhookRepository } from '../../../../src/modules/receivables/infrastructure/transactions/prismaMercadoPagoLiveWebhookRepository.js';
import { PrismaMercadoPagoWebhookRepository } from '../../../../src/modules/receivables/infrastructure/transactions/prismaMercadoPagoWebhookRepository.js';
import { ProcessMercadoPagoLiveWebhookService } from '../../../../src/modules/receivables/infrastructure/workers/processMercadoPagoLiveWebhook.service.js';
import type { ClaimedMercadoPagoWebhook } from '../../../../src/modules/receivables/domain/types/mercadoPagoWebhook.types.js';
import { PrismaReceivableProviderPaymentRepository } from '../../../../src/modules/receivables/infrastructure/transactions/prismaReceivableProviderPaymentRepository.js';

const url = process.env.PAYMENT_INTEGRATION_DATABASE_URL;
// Keep Vitest's internal suite collector types out of the exported declaration.
export function paymentIntegrationSuite(name: string, callback: () => void): void {
  if (url === undefined) {
    describe.skip(name, callback);

    return;
  }

  describe(name, callback);
}

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

export function createPaymentFixture() {
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
      await prisma.receivablePaymentLink.deleteMany({ where: { organizationId } });
      await prisma.receivable.deleteMany({ where: { organizationId } });
      await prisma.workOrder.deleteMany({ where: { organizationId } });
      await prisma.quote.deleteMany({ where: { organizationId } });
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.organizationTrial.deleteMany({ where: { organizationId } });
      await prisma.mercadoPagoConnection.deleteMany({ where: { organizationId } });
      await prisma.mercadoPagoOAuthAttempt.deleteMany({ where: { organizationId } });
      await prisma.organizationReceivingSettings.deleteMany({ where: { organizationId } });
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
      data: {
        name: 'Fixture owner',
        email: randomUUID() + '@example.invalid',
        emailVerifiedAt: now
      },
    });
    users.push(user.id);

    const organization = await prisma.organization.create({
      data: {
        name: 'Fixture organization',
        ownerId: user.id,
        setupCompletedAt: now
      },
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
      data: {
        ...snapshot,
        ...totals,
        status: 'APPROVED',
        sentAt: now,
        decidedAt: now
      },
    });
    const workOrder = await prisma.workOrder.create({
      data: { ...snapshot, ...totals, quoteId: quote.id },
    });
    const receivable = await prisma.receivable.create({
      data: {
        ...snapshot,
        workOrderId: workOrder.id,
        amountInCents: 10_000,
        dueAt: now
      },
    });
    const actor = {
      organizationId: organization.id,
      userId: user.id,
      receivableId: receivable.id
    };
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

    return {
      actor,
      registration,
      payment,
      receivable
    };
  }

  function tlv(id: string, value: string): string {
    return id + String(value.length).padStart(2, '0') + value;
  }

  function fixtureQr(): string {
    const payload = [
      tlv('00', '01'),
      tlv('01', '12'),
      tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('25', 'example.invalid/test')),
      tlv('52', '0000'),
      tlv('53', '986'),
      tlv('54', '100.00'),
      tlv('58', 'BR'),
      tlv('59', 'TEST'),
      tlv('60', 'SAO PAULO'),
      tlv('62', tlv('05', '***')),
      '6304',
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
          [
            'credential',
            actor.organizationId,
            clientId,
            'true',
            accountId,
            'access'
          ], accessToken,
        ),
        refreshTokenCiphertext: runtime.cipher.seal(
          [
            'credential',
            actor.organizationId,
            clientId,
            'true',
            accountId,
            'refresh'
          ], 'fixture-refresh',
        ),
      },
    });
    const credentials = new MercadoPagoCredentialService(prisma, runtime);
    const credentialAccess = vi.spyOn(credentials, 'accessForOwner').mockResolvedValue({
      accountId,
      accessToken,
      liveMode: true,
      expiresAt,
    });

    const create = vi.spyOn(runtime.requireEnabled().client, 'createLivePix').mockImplementation(async (input) => {
      // A distinct connection can only read a committed reservation.
      const reserved = await prisma.mercadoPagoLivePix.findUniqueOrThrow({ where: { id: input.issuanceId } });

      expect(reserved).toMatchObject({ status: 'RESERVED', organizationId: actor.organizationId, accountId });

      return {
        kind: 'PENDING',
        paymentId,
        accountId,
        issuanceId: input.issuanceId,
        amountInCents: input.amountInCents,
        currency: 'brl',
        liveMode: true,
        copyAndPaste: fixtureQr(),
        expiresAt: input.expiresAt,
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

    return {
      ...setup,
      actor,
      repository,
      credentials,
      credentialAccess,
      create,
      input,
      clientId,
      accountId,
      paymentId,
      runtime
    };
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
        issuanceId: issuance.issuanceId,
        accountId: f.accountId,
        paymentId: f.paymentId,
        amountInCents: 10_000,
        accessToken: 'fixture-access',
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
    return {
      ...f,
      issuance,
      inbox,
      sandbox,
      processor,
      read,
      approval,
      notice,
      claim,
      delivery,
      stored,
      issuanceRow
    };
  }

  async function ledger(receivableId: string) {
    const receivable = await prisma.receivable.findUniqueOrThrow({ where: { id: receivableId } });
    const payments = await prisma.receivablePayment.findMany({ where: { receivableId } });

    return { receivable, payments };
  }

  return {
    get prisma() {
      return prisma;
    },
    get useCase() {
      return useCase;
    },
    users,
    fixture,
    fixtureQr,
    liveFixture,
    liveReview,
    settlementFixture,
    ledger,
  };
}
