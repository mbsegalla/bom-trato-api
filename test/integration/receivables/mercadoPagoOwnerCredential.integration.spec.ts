import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';

import { MercadoPagoCredentialService } from '../../../src/modules/receivables/infrastructure/transactions/mercadoPagoCredentialService.js';

import { createPaymentFixture, paymentIntegrationSuite } from './support/payment.fixture.js';

paymentIntegrationSuite('Mercado Pago owner credentials (disposable PostgreSQL)', () => {
  const context = createPaymentFixture();

  async function setup() {
    const { prisma, liveFixture } = context;
    const f = await liveFixture();
    const service = new MercadoPagoCredentialService(prisma, f.runtime);
    const client = f.runtime.requireEnabled().client;
    const where = { organizationId_liveMode: { organizationId: f.actor.organizationId, liveMode: true } };
    const aad = (purpose: 'access' | 'refresh') => [
      'credential',
      f.actor.organizationId,
      f.clientId,
      'true',
      f.accountId,
      purpose,
    ];
    const read = () => prisma.mercadoPagoConnection.findUniqueOrThrow({ where });
    const nearExpiry = () =>
      prisma.mercadoPagoConnection.update({
        where,
        data: { expiresAt: new Date(Date.now() + 60_000) },
      });
    const rotated = {
      accountId: f.accountId,
      accessToken: 'new-fixture-access',
      refreshToken: 'new-fixture-refresh',
      expiresAt: new Date(Date.now() + 3_600_000),
      liveMode: true,
    };

    return { ...f, service, client, where, aad, read, nearExpiry, rotated };
  }

  it('reuses a valid credential only for its verified owner and active session', async () => {
    const f = await setup();
    const refresh = vi.spyOn(f.client, 'refreshCredentials').mockRejectedValue(new Error('unexpected refresh'));
    const row = await f.read();

    expect(await f.service.accessForOwner(f.actor)).toEqual({
      accountId: f.accountId,
      accessToken: 'fixture-access',
      liveMode: true,
      expiresAt: row.expiresAt,
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(await f.read()).toMatchObject({ refreshClaimId: null, refreshStartedAt: null });
  });

  it('rejects revoked sessions before contacting the provider', async () => {
    const f = await setup();
    const refresh = vi.spyOn(f.client, 'refreshCredentials').mockRejectedValue(new Error('unexpected refresh'));
    await f.nearExpiry();
    await context.prisma.authSession.update({
      where: { id: f.actor.sessionId },
      data: { revokedAt: new Date(), revocationReason: 'LOGOUT' },
    });

    await expect(f.service.accessForOwner(f.actor)).rejects.toThrow('MERCADO_PAGO_UNAVAILABLE');
    expect(refresh).not.toHaveBeenCalled();
    expect(await f.read()).toMatchObject({ refreshClaimId: null });
  });

  it('rejects a session belonging to a different user', async () => {
    const f = await setup();
    const other = await context.liveFixture();
    const refresh = vi.spyOn(f.client, 'refreshCredentials').mockRejectedValue(new Error('unexpected refresh'));

    await expect(f.service.accessForOwner({ ...f.actor, sessionId: other.actor.sessionId })).rejects.toThrow(
      'MERCADO_PAGO_UNAVAILABLE',
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rejects an owner without subscription or trial access', async () => {
    const f = await setup();
    await context.prisma.organizationTrial.update({
      where: { organizationId: f.actor.organizationId },
      data: { revokedAt: new Date() },
    });
    const refresh = vi.spyOn(f.client, 'refreshCredentials').mockRejectedValue(new Error('unexpected refresh'));

    await expect(f.service.accessForOwner(f.actor)).rejects.toThrow('SUBSCRIPTION_REQUIRED');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rejects a missing connection without attempting a provider call', async () => {
    const f = await setup();
    await context.prisma.mercadoPagoConnection.delete({ where: f.where });
    const refresh = vi.spyOn(f.client, 'refreshCredentials').mockRejectedValue(new Error('unexpected refresh'));

    await expect(f.service.accessForOwner(f.actor)).rejects.toThrow('MERCADO_PAGO_UNAVAILABLE');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('persists the refresh claim before I/O and atomically replaces both encrypted tokens', async () => {
    const f = await setup();
    await f.nearExpiry();
    const refresh = vi.spyOn(f.client, 'refreshCredentials').mockImplementation(async (accountId, token) => {
      expect(accountId).toBe(f.accountId);
      expect(token).toBe('fixture-refresh');
      expect(await f.read()).toMatchObject({ refreshClaimId: expect.any(String), refreshStartedAt: expect.any(Date) });
      return f.rotated;
    });

    expect(await f.service.accessForOwner(f.actor)).toEqual({
      accountId: f.accountId,
      accessToken: f.rotated.accessToken,
      liveMode: true,
      expiresAt: f.rotated.expiresAt,
    });
    const row = await f.read();
    expect(row).toMatchObject({ refreshClaimId: null, refreshStartedAt: null, expiresAt: f.rotated.expiresAt });
    expect(f.runtime.cipher.open(f.aad('access'), row.accessTokenCiphertext!)).toBe(f.rotated.accessToken);
    expect(f.runtime.cipher.open(f.aad('refresh'), row.refreshTokenCiphertext!)).toBe(f.rotated.refreshToken);
    expect(row.accessTokenCiphertext).not.toContain(f.rotated.accessToken);
    expect(await f.service.accessForOwner(f.actor)).toMatchObject({ accessToken: f.rotated.accessToken });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps an ambiguous refresh claim and does not retry a potentially consumed token', async () => {
    const f = await setup();
    await f.nearExpiry();
    const refresh = vi.spyOn(f.client, 'refreshCredentials').mockRejectedValue(new Error('fixture provider timeout'));

    await expect(f.service.accessForOwner(f.actor)).rejects.toThrow('MERCADO_PAGO_UNAVAILABLE');
    const row = await f.read();
    expect(row.refreshClaimId).not.toBeNull();
    expect(f.runtime.cipher.open(f.aad('access'), row.accessTokenCiphertext!)).toBe('fixture-access');
    await expect(f.service.accessForOwner(f.actor)).rejects.toThrow('MERCADO_PAGO_UNAVAILABLE');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await f.read()).toMatchObject({ refreshClaimId: row.refreshClaimId });
  });

  it.each(['account', 'mode', 'expiry'] as const)(
    'rejects a rotated credential with incompatible %s',
    async (field) => {
      const f = await setup();
      await f.nearExpiry();
      const credentials =
        field === 'account'
          ? { ...f.rotated, accountId: '99999' }
          : field === 'mode'
            ? { ...f.rotated, liveMode: false }
            : { ...f.rotated, expiresAt: new Date(Date.now() + 1000) };
      const refresh = vi.spyOn(f.client, 'refreshCredentials').mockResolvedValue(credentials);

      await expect(f.service.accessForOwner(f.actor)).rejects.toThrow('MERCADO_PAGO_UNAVAILABLE');
      const row = await f.read();
      expect(row.refreshClaimId).not.toBeNull();
      expect(f.runtime.cipher.open(f.aad('refresh'), row.refreshTokenCiphertext!)).toBe('fixture-refresh');
      expect(refresh).toHaveBeenCalledTimes(1);
    },
  );

  it('does not persist rotated credentials when the session is revoked during provider I/O', async () => {
    const f = await setup();
    await f.nearExpiry();
    vi.spyOn(f.client, 'refreshCredentials').mockImplementation(async () => {
      await context.prisma.authSession.update({
        where: { id: f.actor.sessionId },
        data: { revokedAt: new Date(), revocationReason: 'LOGOUT' },
      });
      return f.rotated;
    });

    await expect(f.service.accessForOwner(f.actor)).rejects.toThrow('MERCADO_PAGO_UNAVAILABLE');
    const row = await f.read();
    expect(row.refreshClaimId).not.toBeNull();
    expect(f.runtime.cipher.open(f.aad('access'), row.accessTokenCiphertext!)).toBe('fixture-access');
  });

  it('does not overwrite a changed refresh claim', async () => {
    const f = await setup();
    await f.nearExpiry();
    const replacement = randomUUID();
    vi.spyOn(f.client, 'refreshCredentials').mockImplementation(async () => {
      await context.prisma.mercadoPagoConnection.update({
        where: f.where,
        data: { refreshClaimId: replacement },
      });
      return f.rotated;
    });

    await expect(f.service.accessForOwner(f.actor)).rejects.toThrow('MERCADO_PAGO_UNAVAILABLE');
    expect(await f.read()).toMatchObject({ refreshClaimId: replacement });
  });

  it('serializes concurrent refresh attempts without a duplicate provider grant', async () => {
    const f = await setup();
    await f.nearExpiry();
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const refresh = vi.spyOn(f.client, 'refreshCredentials').mockImplementation(async () => {
      entered();
      await waiting;
      return f.rotated;
    });
    const first = f.service.accessForOwner(f.actor);
    await started;
    try {
      await expect(f.service.accessForOwner(f.actor)).rejects.toThrow('MERCADO_PAGO_UNAVAILABLE');
    } finally {
      release();
      await first;
    }
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await f.read()).toMatchObject({ refreshClaimId: null, refreshStartedAt: null });
  }, 30_000);
});
