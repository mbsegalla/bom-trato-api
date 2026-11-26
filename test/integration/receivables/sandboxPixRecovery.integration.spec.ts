import { createHash, randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';

import { MercadoPagoError } from '../../../src/modules/receivables/infrastructure/providers/mercadoPago/mercadoPagoClient.js';
import { MercadoPagoConnectionRuntime } from '../../../src/modules/receivables/infrastructure/providers/mercadoPago/mercadoPagoConnectionRuntime.js';
import { MercadoPagoCredentialService } from '../../../src/modules/receivables/infrastructure/transactions/mercadoPagoCredentialService.js';
import { PrismaMercadoPagoSandboxPixRepository } from '../../../src/modules/receivables/infrastructure/transactions/prismaMercadoPagoSandboxPixRepository.js';
import { PrismaMercadoPagoSandboxPixRecoveryRepository } from '../../../src/modules/receivables/infrastructure/transactions/prismaMercadoPagoSandboxPixRecoveryRepository.js';

import { PrismaMercadoPagoWebhookRepository } from '../../../src/modules/receivables/infrastructure/transactions/prismaMercadoPagoWebhookRepository.js';
import { ProcessMercadoPagoWebhookService } from '../../../src/modules/receivables/infrastructure/workers/processMercadoPagoWebhook.service.js';
import type { ClaimedMercadoPagoWebhook } from '../../../src/modules/receivables/domain/types/mercadoPagoWebhook.types.js';

import { createPaymentFixture, paymentIntegrationSuite } from './support/payment.fixture.js';

paymentIntegrationSuite('sandbox Pix recovery (disposable PostgreSQL)', () => {
  const context = createPaymentFixture();

  async function setup() {
    const { prisma, liveFixture, fixtureQr } = context;
    const f = await liveFixture();
    const runtime = new MercadoPagoConnectionRuntime({
      enabled: true, liveMode: false, sandboxPixEnabled: true,
      clientId: f.clientId, clientSecret: 'fixture-secret', encryptionKey: 'a'.repeat(64),
      redirectUri: 'https://example.invalid/mercado-pago/callback',
    });
    const connectedAt = new Date();
    const expiresAt = new Date(connectedAt.getTime() + 3600000);
    const aad = ['credential', f.actor.organizationId, f.clientId, 'false', f.accountId];
    await prisma.mercadoPagoConnection.create({
      data: {
        organizationId: f.actor.organizationId, liveMode: false, clientId: f.clientId,
        accountId: f.accountId, connectedById: f.actor.userId, connectedAt, expiresAt,
        accessTokenCiphertext: runtime.cipher.seal([...aad, 'access'], 'sandbox-fixture-access'),
        refreshTokenCiphertext: runtime.cipher.seal([...aad, 'refresh'], 'sandbox-fixture-refresh'),
      },
    });
    const credentials = new MercadoPagoCredentialService(prisma, runtime);
    const issuer = new PrismaMercadoPagoSandboxPixRepository(prisma, runtime, credentials);
    const recovery = new PrismaMercadoPagoSandboxPixRecoveryRepository(prisma, runtime, credentials);
    const client = runtime.requireEnabled().client;
    vi.spyOn(client, 'refreshCredentials').mockRejectedValue(new Error('unexpected refresh'));
    const create = vi.spyOn(client, 'createSandboxPix').mockImplementation(async (request) => ({
      kind: 'PENDING', paymentId: f.paymentId, accountId: request.accountId,
      issuanceId: request.issuanceId, amountInCents: request.amountInCents, liveMode: false,
      currency: 'brl', copyAndPaste: fixtureQr(), expiresAt: request.expiresAt,
    }));
    const read = vi.spyOn(client, 'readSandboxPix').mockResolvedValue('PENDING');
    const search = vi.spyOn(client, 'searchSandboxPix').mockResolvedValue({ kind: 'NOT_FOUND' });
    const input = {
      version: f.receivable.version, testBuyerEmail: 'fixture@example.invalid',
      testDocumentType: 'CPF' as const, testDocumentNumber: '19119119100', confirmed: true,
    };
    async function issue(uncertain = false) {
      if (uncertain) create.mockRejectedValueOnce(new Error('fixture timeout'));
      const result = await issuer.issue(f.actor, input);
      if (result.issuanceId === null) throw new Error('Fixture issuance missing');
      return { issuanceId: result.issuanceId };
    }
    const connectionWhere = { organizationId_liveMode: { organizationId: f.actor.organizationId, liveMode: false } };
    const issuance = (id: string) => prisma.mercadoPagoSandboxPix.findUniqueOrThrow({ where: { id } });
    const attempts = (id: string) => prisma.mercadoPagoSandboxPixRecovery.findMany({
      where: { issuanceId: id }, orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    });
    const inbox = new PrismaMercadoPagoWebhookRepository(prisma, runtime);
    const processor = new ProcessMercadoPagoWebhookService(inbox, runtime);
    async function delivery(paymentId = f.paymentId) {
      const notice = {
        clientId: f.clientId, deliveryKey: createHash('sha256').update(randomUUID()).digest('hex'),
        paymentId, requestId: randomUUID(), signedAt: new Date(),
      };
      await inbox.enqueue(notice);
      const job = await inbox.claim(f.clientId, randomUUID());
      if (job === null) throw new Error('Fixture webhook not claimed');
      expect(job.deliveryKey).toBe(notice.deliveryKey);
      return job;
    }
    const stored = (job: ClaimedMercadoPagoWebhook) => prisma.mercadoPagoWebhookEvent.findUniqueOrThrow({
      where: { clientId_deliveryKey: { clientId: job.clientId, deliveryKey: job.deliveryKey } },
    });
    return { ...f, runtime, issuer, recovery, create, read, search, input, issue, connectionWhere, issuance, attempts, inbox, processor, delivery, stored };
  }

  it('returns an empty recovery view before any sandbox issuance', async () => {
    const f = await setup();
    expect(await f.recovery.read(f.actor)).toEqual({
      organizationId: f.actor.organizationId, receivableId: f.receivable.id,
      issuanceId: null, canRecover: false, nextRecoveryAt: null, lastAttempt: null, lastWebhook: null,
    });
    await expect(f.recovery.recover(f.actor, { issuanceId: randomUUID() })).rejects.toThrow('MERCADO_PAGO_PIX_CONFLICT');
    expect(f.read).not.toHaveBeenCalled();
    expect(f.search).not.toHaveBeenCalled();
  });

  it('claims a bound payment durably, preserves a pending QR and enforces recovery cooldown', async () => {
    const f = await setup();
    const input = await f.issue();
    f.read.mockImplementationOnce(async (request) => {
      expect(request).toMatchObject({
        issuanceId: input.issuanceId, paymentId: f.paymentId, accountId: f.accountId,
        accessToken: 'sandbox-fixture-access', amountInCents: 10000,
      });
      expect(await f.attempts(input.issuanceId)).toMatchObject([{ status: 'IN_PROGRESS', completedAt: null }]);
      return 'PENDING';
    });
    expect(await f.recovery.read(f.actor)).toMatchObject({ canRecover: true });
    expect(await f.recovery.recover(f.actor, input)).toMatchObject({
      canRecover: false, nextRecoveryAt: expect.any(Date),
      lastAttempt: { status: 'VERIFIED_PENDING', paymentId: f.paymentId, completedAt: expect.any(Date) },
    });
    expect(await f.issuance(input.issuanceId)).toMatchObject({ status: 'PENDING', copyAndPasteCiphertext: expect.any(String) });
    expect((await f.issuer.read(f.actor)).copyAndPaste).toBe(context.fixtureQr());
    await expect(f.recovery.recover(f.actor, input)).rejects.toThrow('MERCADO_PAGO_PIX_CONFLICT');
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(f.search).not.toHaveBeenCalled();
    expect(f.create).toHaveBeenCalledTimes(1);
    expect((await context.ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it.each(['APPROVED', 'CLOSED', 'REFUNDED', 'REVIEW_REQUIRED'] as const)('hides the QR after verified %s without applying a live ledger entry', async (status) => {
    const f = await setup();
    const input = await f.issue();
    f.read.mockResolvedValue(status);
    expect(await f.recovery.recover(f.actor, input)).toMatchObject({
      lastAttempt: { status: 'VERIFIED_' + status, paymentId: f.paymentId },
    });
    expect(await f.issuance(input.issuanceId)).toMatchObject({
      status: 'REVIEW_REQUIRED', copyAndPasteCiphertext: null, expiresAt: null, externalPaymentId: f.paymentId,
    });
    expect(await f.issuer.issue(f.actor, f.input)).toMatchObject({ status: 'REVIEW_REQUIRED', copyAndPaste: null });
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(await context.ledger(f.receivable.id)).toMatchObject({
      receivable: { receivedInCents: 0, status: 'OPEN', version: 1 }, payments: [],
    });
  });

  it('searches the original reservation after uncertain creation and binds a verified payment without restoring a QR', async () => {
    const f = await setup();
    const input = await f.issue(true);
    f.search.mockResolvedValue({ kind: 'FOUND', paymentId: f.paymentId, status: 'PENDING' });
    expect(await f.recovery.recover(f.actor, input)).toMatchObject({
      lastAttempt: { status: 'VERIFIED_PENDING', paymentId: f.paymentId },
    });
    expect(f.search).toHaveBeenCalledWith({
      issuanceId: input.issuanceId, accountId: f.accountId, amountInCents: 10000, accessToken: 'sandbox-fixture-access',
    });
    expect(f.read).not.toHaveBeenCalled();
    expect(await f.issuance(input.issuanceId)).toMatchObject({
      status: 'REVIEW_REQUIRED', externalPaymentId: f.paymentId, copyAndPasteCiphertext: null, expiresAt: null,
    });
    expect(f.create).toHaveBeenCalledTimes(1);
    expect((await context.ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it.each(['NOT_FOUND', 'AMBIGUOUS'] as const)('records %s without inventing a provider identity', async (kind) => {
    const f = await setup();
    const input = await f.issue(true);
    f.search.mockResolvedValue({ kind });
    expect(await f.recovery.recover(f.actor, input)).toMatchObject({ lastAttempt: { status: kind, paymentId: null } });
    expect(await f.issuance(input.issuanceId)).toMatchObject({
      status: 'REVIEW_REQUIRED', externalPaymentId: null, copyAndPasteCiphertext: null,
    });
    expect(f.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    [new MercadoPagoError('INVALID_RESPONSE'), 'INVALID_PROVIDER_PAYMENT', 'REVIEW_REQUIRED'],
    [new MercadoPagoError('REQUEST_FAILED'), 'PROVIDER_UNAVAILABLE', 'PENDING'],
    [new Error('fixture timeout'), 'PROVIDER_UNAVAILABLE', 'PENDING'],
  ] as const)('records provider failure and preserves only safe payment state', async (error, status, issuanceStatus) => {
    const f = await setup();
    const input = await f.issue();
    f.read.mockRejectedValue(error);
    expect(await f.recovery.recover(f.actor, input)).toMatchObject({ lastAttempt: { status, paymentId: null } });
    expect(await f.issuance(input.issuanceId)).toMatchObject({ status: issuanceStatus });
    expect((await context.ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('rejects a mismatched issuance id before contacting the provider', async () => {
    const f = await setup();
    const input = await f.issue();
    await expect(f.recovery.recover(f.actor, { issuanceId: randomUUID() })).rejects.toThrow('MERCADO_PAGO_PIX_CONFLICT');
    expect(await f.attempts(input.issuanceId)).toHaveLength(0);
    expect(f.read).not.toHaveBeenCalled();
    expect(f.search).not.toHaveBeenCalled();
  });

  it('never starts a second provider recovery while an active lease is in progress', async () => {
    const f = await setup();
    const input = await f.issue();
    f.read.mockImplementationOnce(async () => {
      await expect(f.recovery.recover(f.actor, input)).rejects.toThrow('MERCADO_PAGO_PIX_CONFLICT');
      return 'PENDING';
    });
    await f.recovery.recover(f.actor, input);
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(await f.attempts(input.issuanceId)).toHaveLength(1);
  });

  it('abandons an expired lease before claiming another recovery', async () => {
    const f = await setup();
    const input = await f.issue();
    const expired = await context.prisma.mercadoPagoSandboxPixRecovery.create({
      data: {
        issuanceId: input.issuanceId, startedById: f.actor.userId,
        startedAt: new Date(Date.now() - 180000), leaseExpiresAt: new Date(Date.now() - 60000),
      },
    });
    expect(await f.recovery.read(f.actor)).toMatchObject({
      canRecover: true, lastAttempt: { status: 'ABANDONED' },
    });
    expect(await f.recovery.recover(f.actor, input)).toMatchObject({ lastAttempt: { status: 'VERIFIED_PENDING' } });
    expect(await context.prisma.mercadoPagoSandboxPixRecovery.findUniqueOrThrow({ where: { id: expired.id } }))
      .toMatchObject({ status: 'ABANDONED', completedAt: expect.any(Date) });
    expect(await f.attempts(input.issuanceId)).toHaveLength(2);
  });

  it('does not apply a provider response if the session was revoked during I/O', async () => {
    const f = await setup();
    const input = await f.issue();
    f.read.mockImplementationOnce(async () => {
      await context.prisma.authSession.update({
        where: { id: f.actor.sessionId }, data: { revokedAt: new Date(), revocationReason: 'LOGOUT' },
      });
      return 'APPROVED';
    });
    expect(await f.recovery.recover(f.actor, input)).toMatchObject({
      lastAttempt: { status: 'CONNECTION_CHANGED', paymentId: null },
    });
    expect(await f.issuance(input.issuanceId)).toMatchObject({ status: 'PENDING' });
    expect((await context.ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('rejects sandbox recovery after a connection has been disconnected', async () => {
    const f = await setup();
    const input = await f.issue();
    await context.prisma.mercadoPagoConnection.update({
      where: f.connectionWhere,
      data: { disconnectedAt: new Date(), accessTokenCiphertext: null, refreshTokenCiphertext: null, expiresAt: null },
    });
    expect(await f.recovery.read(f.actor)).toMatchObject({ canRecover: false });
    await expect(f.recovery.recover(f.actor, input)).rejects.toThrow('MERCADO_PAGO_PIX_CONFLICT');
    expect(f.read).not.toHaveBeenCalled();
    expect(f.search).not.toHaveBeenCalled();
  });
  it('acknowledges a pending webhook against the persisted binding and keeps the QR visible', async () => {
    const f = await setup();
    const input = await f.issue();
    const job = await f.delivery();

    expect(await f.processor.execute(job)).toBe(true);
    expect(await f.stored(job)).toMatchObject({
      resultCode: 'VERIFIED_PENDING', matchedIssuanceId: input.issuanceId,
      processedAt: expect.any(Date), reviewRequiredAt: null, leaseToken: null,
    });
    expect(await f.issuer.read(f.actor)).toMatchObject({ status: 'PENDING', copyAndPaste: context.fixtureQr() });
    expect(await f.recovery.read(f.actor)).toMatchObject({
      lastWebhook: { status: 'VERIFIED_PENDING', receivedAt: expect.any(Date) },
    });
    expect((await context.ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('does not restore a QR when an out-of-order pending webhook follows an approval', async () => {
    const f = await setup();
    const input = await f.issue();
    const approved = await f.delivery();
    f.read.mockResolvedValueOnce('APPROVED');

    expect(await f.processor.execute(approved)).toBe(true);
    expect(await f.stored(approved)).toMatchObject({ resultCode: 'VERIFIED_APPROVED', processedAt: expect.any(Date) });
    const pending = await f.delivery();
    expect(await f.processor.execute(pending)).toBe(true);
    expect(await f.stored(pending)).toMatchObject({ resultCode: 'VERIFIED_PENDING' });
    expect(await f.issuance(input.issuanceId)).toMatchObject({ status: 'REVIEW_REQUIRED', copyAndPasteCiphertext: null });
    expect(await context.ledger(f.receivable.id)).toMatchObject({
      receivable: { receivedInCents: 0, status: 'OPEN', version: 1 }, payments: [],
    });
  });

  it.each(['REFUNDED', 'REVIEW_REQUIRED'] as const)('marks a verified %s webhook for review', async (status) => {
    const f = await setup();
    const input = await f.issue();
    f.read.mockResolvedValue(status);
    const job = await f.delivery();

    expect(await f.processor.execute(job)).toBe(true);
    expect(await f.stored(job)).toMatchObject({
      resultCode: 'VERIFIED_' + status, matchedIssuanceId: input.issuanceId,
      reviewRequiredAt: expect.any(Date), processedAt: null,
    });
    expect(await f.issuance(input.issuanceId)).toMatchObject({ status: 'REVIEW_REQUIRED', copyAndPasteCiphertext: null });
    expect(await f.inbox.claim(f.clientId, randomUUID())).toBeNull();
  });

  it('does not contact a seller for an unmatched signed payment identifier', async () => {
    const f = await setup();
    await f.issue();
    const job = await f.delivery('123');

    expect(await f.processor.execute(job)).toBe(true);
    expect(await f.stored(job)).toMatchObject({
      resultCode: 'UNMATCHED_PAYMENT', attempts: 1, processedAt: null, matchedIssuanceId: null,
    });
    expect(f.read).not.toHaveBeenCalled();
  });

  it('does not renew or use disconnected credentials in the webhook worker', async () => {
    const f = await setup();
    await f.issue();
    await context.prisma.mercadoPagoConnection.update({
      where: f.connectionWhere,
      data: { disconnectedAt: new Date(), accessTokenCiphertext: null, refreshTokenCiphertext: null, expiresAt: null },
    });
    const job = await f.delivery();

    expect(await f.processor.execute(job)).toBe(true);
    expect(await f.stored(job)).toMatchObject({ resultCode: 'CREDENTIAL_UNAVAILABLE', processedAt: null });
    expect(f.read).not.toHaveBeenCalled();
  });

  it('handles a sandbox webhook without a user session and never applies it to the live ledger', async () => {
    const f = await setup();
    const input = await f.issue();
    await context.prisma.authSession.update({
      where: { id: f.actor.sessionId }, data: { revokedAt: new Date(), revocationReason: 'LOGOUT' },
    });
    const job = await f.delivery();
    f.read.mockResolvedValue('APPROVED');

    expect(await f.processor.execute(job)).toBe(true);
    expect(await f.stored(job)).toMatchObject({ resultCode: 'VERIFIED_APPROVED', matchedIssuanceId: input.issuanceId });
    expect((await context.ledger(f.receivable.id)).payments).toHaveLength(0);
  });

  it('does not finalize an event or invalidate its QR after the event lease expires', async () => {
    const f = await setup();
    const input = await f.issue();
    const job = await f.delivery();
    f.read.mockImplementationOnce(async () => {
      await context.prisma.mercadoPagoWebhookEvent.update({
        where: { clientId_deliveryKey: { clientId: job.clientId, deliveryKey: job.deliveryKey } },
        data: { leaseExpiresAt: new Date(Date.now() - 1000) },
      });
      return 'APPROVED';
    });

    expect(await f.processor.execute(job)).toBe(false);
    expect(await f.stored(job)).toMatchObject({ processedAt: null, attempts: 0 });
    expect(await f.issuance(input.issuanceId)).toMatchObject({ status: 'PENDING', copyAndPasteCiphertext: expect.any(String) });
    const replacement = await f.inbox.claim(f.clientId, randomUUID());
    expect(replacement).toMatchObject({ deliveryKey: job.deliveryKey });
  });

  it('retries when the connection changes during provider verification', async () => {
    const f = await setup();
    const input = await f.issue();
    const job = await f.delivery();
    f.read.mockImplementationOnce(async () => {
      await context.prisma.mercadoPagoConnection.update({
        where: f.connectionWhere, data: { connectedAt: new Date(Date.now() - 60000) },
      });
      return 'APPROVED';
    });

    expect(await f.processor.execute(job)).toBe(true);
    expect(await f.stored(job)).toMatchObject({ resultCode: 'CONNECTION_CHANGED', processedAt: null });
    expect(await f.issuance(input.issuanceId)).toMatchObject({ status: 'PENDING' });
  });

  it('rejects a checked response that refers to a different payment', async () => {
    const f = await setup();
    const input = await f.issue();
    const job = await f.delivery();
    const prepared = await f.inbox.prepare(job);
    if (prepared.kind !== 'READY') throw new Error('Expected a bound payment');

    expect(await f.inbox.settle(job, {
      kind: 'CHECKED', binding: { ...prepared.access.binding, paymentId: '123' },
      connectedAt: prepared.access.connectedAt, status: 'APPROVED',
    })).toBe(true);
    expect(await f.stored(job)).toMatchObject({ resultCode: 'INVALID_PROVIDER_PAYMENT', reviewRequiredAt: expect.any(Date) });
    expect(await f.issuance(input.issuanceId)).toMatchObject({ status: 'PENDING' });
  });
});
