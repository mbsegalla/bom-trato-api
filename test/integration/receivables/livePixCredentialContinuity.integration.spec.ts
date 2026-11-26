import { expect, it, vi } from 'vitest';

import { MercadoPagoConnectionRuntime } from '../../../src/modules/receivables/infrastructure/providers/mercadoPago/mercadoPagoConnectionRuntime.js';
import { PrismaMercadoPagoLiveWebhookRepository } from '../../../src/modules/receivables/infrastructure/transactions/prismaMercadoPagoLiveWebhookRepository.js';
import { ProcessMercadoPagoLiveWebhookService } from '../../../src/modules/receivables/infrastructure/workers/processMercadoPagoLiveWebhook.service.js';

import { createPaymentFixture, paymentIntegrationSuite } from './support/payment.fixture.js';

paymentIntegrationSuite('livePixCredentialContinuity (disposable PostgreSQL)', () => {
  const context = createPaymentFixture();

  it('rotates a still-valid offline credential for a bound delivery without a user session', async () => {
    const { prisma, fixture, settlementFixture, ledger } = context;

    const f = await settlementFixture();
    const key = { organizationId_liveMode: { organizationId: f.actor.organizationId, liveMode: true } };

    await prisma.mercadoPagoConnection.update({ where: key, data: { expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.authSession.update({
      where: { id: f.actor.sessionId },
      data: {
        revokedAt: new Date(),
        revocationReason: 'LOGOUT',
      },
    });
    const expiresAt = new Date(Date.now() + 3_600_000);

    const refresh = vi
      .spyOn(f.runtime.requireEnabled().client, 'refreshCredentials')
      .mockImplementation(async (accountId, token) => {
        expect(accountId).toBe(f.accountId);
        expect(token).toBe('fixture-refresh');

        const row = await prisma.mercadoPagoConnection.findUniqueOrThrow({ where: key });

        expect(row.refreshClaimId).not.toBeNull();

        return {
          accountId,
          accessToken: 'fixture-rotated-access',
          refreshToken: 'fixture-rotated-refresh',
          expiresAt,
          liveMode: true,
        };
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
    expect(
      f.runtime.cipher.open(
        ['credential', f.actor.organizationId, f.clientId, 'true', f.accountId, 'refresh'],
        row.refreshTokenCiphertext!,
      ),
    ).toBe('fixture-rotated-refresh');
    expect((await ledger(f.receivable.id)).payments).toHaveLength(1);
  });

  it('retains an uncertain refresh claim and never repeats the possibly consumed grant', async () => {
    const { prisma, fixture, settlementFixture, ledger } = context;

    const f = await settlementFixture();
    const key = { organizationId_liveMode: { organizationId: f.actor.organizationId, liveMode: true } };

    await prisma.mercadoPagoConnection.update({ where: key, data: { expiresAt: new Date(Date.now() + 60_000) } });
    const refresh = vi
      .spyOn(f.runtime.requireEnabled().client, 'refreshCredentials')
      .mockRejectedValue(new Error('fixture timeout'));

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
    expect(await prisma.mercadoPagoConnection.findUniqueOrThrow({ where: key })).toMatchObject({
      refreshClaimId: claim.refreshClaimId,
    });
  });

  it('never renews credentials for an unmatched delivery or an already expired token', async () => {
    const { prisma, settlementFixture } = context;

    const f = await settlementFixture();
    const key = { organizationId_liveMode: { organizationId: f.actor.organizationId, liveMode: true } };
    const refresh = vi
      .spyOn(f.runtime.requireEnabled().client, 'refreshCredentials')
      .mockRejectedValue(new Error('unexpected refresh'));

    await prisma.mercadoPagoConnection.update({ where: key, data: { expiresAt: new Date(Date.now() + 60_000) } });
    await f.inbox.enqueue(f.notice('987654321'));
    const unmatched = await f.claim();

    expect(await f.processor.execute(unmatched)).toBe(true);
    expect(await f.stored(unmatched)).toMatchObject({ resultCode: 'UNMATCHED_PAYMENT' });
    // An expired credential must still have been issued before its expiry.
    const expiredAt = new Date(Date.now() - 1000);

    await prisma.mercadoPagoConnection.update({
      where: key,
      data: {
        connectedAt: new Date(expiredAt.getTime() - 3_600_000),
        expiresAt: expiredAt,
      },
    });
    const bound = await f.delivery();

    expect(await f.processor.execute(bound)).toBe(true);
    expect(await f.stored(bound)).toMatchObject({ resultCode: 'CREDENTIAL_UNAVAILABLE' });
    expect(refresh).not.toHaveBeenCalled();
    expect(f.read).not.toHaveBeenCalled();
  });

  it('continues settling an existing bound payment while new live issuance is switched off', async () => {
    const { prisma, fixture, settlementFixture, ledger } = context;

    const f = await settlementFixture();
    const runtime = new MercadoPagoConnectionRuntime({
      enabled: true,
      liveMode: true,
      sandboxPixEnabled: false,
      livePixEnabled: false,
      clientId: f.clientId,
      clientSecret: 'fixture-secret',
      encryptionKey: 'a'.repeat(64),
      redirectUri: 'https://example.invalid/mercado-pago/callback',
    });

    expect(runtime.livePixAvailable).toBe(false);

    const inbox = new PrismaMercadoPagoLiveWebhookRepository(prisma, runtime);
    const processor = new ProcessMercadoPagoLiveWebhookService(inbox, runtime);
    vi.spyOn(runtime.requireEnabled().client, 'readLivePix').mockImplementation(async (input) => ({
      status: 'APPROVED',
      payment: f.approval(input.eventId),
    }));

    const job = await f.delivery();

    expect(await processor.execute(job)).toBe(true);
    expect(await f.stored(job)).toMatchObject({ resultCode: 'LEDGER_APPLIED' });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(1);
  });

  it('still settles a valid live payment after subscription access expires', async () => {
    const { prisma, settlementFixture, ledger } = context;

    const f = await settlementFixture();
    await prisma.organizationTrial.update({
      where: { organizationId: f.actor.organizationId },
      data: { revokedAt: new Date() },
    });
    const job = await f.delivery();

    expect(await f.processor.execute(job)).toBe(true);
    expect(await f.stored(job)).toMatchObject({ resultCode: 'LEDGER_APPLIED' });
    expect((await ledger(f.receivable.id)).payments).toHaveLength(1);
  });
});
