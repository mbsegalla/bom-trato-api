import { createHash, randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';

import { PrismaMercadoPagoConnectionRepository } from '../../../src/modules/receivables/infrastructure/transactions/prismaMercadoPagoConnectionRepository.js';

import { createPaymentFixture, paymentIntegrationSuite } from './support/payment.fixture.js';

paymentIntegrationSuite('Mercado Pago OAuth connection (disposable PostgreSQL)', () => {
  const context = createPaymentFixture();

  async function setup() {
    const f = await context.liveFixture();
    const repository = new PrismaMercadoPagoConnectionRepository(context.prisma, f.runtime);
    const client = f.runtime.requireEnabled().client;
    const identity = { userId: f.actor.userId, sessionId: f.actor.sessionId };
    const where = { organizationId_liveMode: { organizationId: f.actor.organizationId, liveMode: true } };
    const attemptWhere = { organizationId: f.actor.organizationId };
    const readConnection = () => context.prisma.mercadoPagoConnection.findUniqueOrThrow({ where });
    const readAttempt = () => context.prisma.mercadoPagoOAuthAttempt.findUniqueOrThrow({ where: attemptWhere });
    const credentials = {
      accountId: f.accountId, liveMode: true, accessToken: 'new-fixture-access',
      refreshToken: 'new-fixture-refresh', expiresAt: new Date(Date.now() + 3600000),
    };
    async function start() {
      const result = await repository.start(f.actor);
      const url = new URL(result.authorizationUrl);
      const state = url.searchParams.get('state')!;
      return { result, url, state, input: { state, code: 'fixture-code' } };
    }

    return { ...f, repository, client, identity, where, attemptWhere, readConnection, readAttempt, credentials, start };
  }

  it('reports the current connection without exposing encrypted credentials', async () => {
    const f = await setup();
    expect(await f.repository.read(f.actor)).toEqual({
      available: true, liveMode: true, canConnect: true, canDisconnect: true, status: 'CONNECTED',
      accountId: f.accountId, connectedAt: (await f.readConnection()).connectedAt,
      expiresAt: (await f.readConnection()).expiresAt,
    });
  });

  it('reports an absent connection and allows cancellation of a pending OAuth attempt', async () => {
    const f = await setup();
    await context.prisma.mercadoPagoConnection.delete({ where: f.where });
    expect(await f.repository.read(f.actor)).toMatchObject({
      status: 'NOT_CONNECTED', accountId: null, canConnect: true, canDisconnect: false,
    });
    await f.start();
    expect(await f.repository.read(f.actor)).toMatchObject({ status: 'NOT_CONNECTED', canDisconnect: true });
    await f.repository.disconnect(f.actor);
    expect(await context.prisma.mercadoPagoOAuthAttempt.findUnique({ where: f.attemptWhere })).toBeNull();
    expect(await f.repository.read(f.actor)).toMatchObject({ canDisconnect: false });
  });

  it('reports expired credentials and prevents reconnection while a refresh claim is cooling down', async () => {
    const f = await setup();
    await context.prisma.mercadoPagoConnection.update({
      where: f.where,
      data: { connectedAt: new Date(Date.now() - 3600000), expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await f.repository.read(f.actor)).toMatchObject({ status: 'EXPIRED', canConnect: true });
    await context.prisma.mercadoPagoConnection.update({
      where: f.where, data: { refreshClaimId: randomUUID(), refreshStartedAt: new Date() },
    });
    expect(await f.repository.read(f.actor)).toMatchObject({ status: 'RECONNECT_REQUIRED', canConnect: false });
    await expect(f.start()).rejects.toThrow('RECEIVING_SETTINGS_BUSY');
  });

  it('persists only a hashed state and an encrypted PKCE verifier bound to the session', async () => {
    const f = await setup();
    const { result, url, state } = await f.start();
    const row = await f.readAttempt();
    const hash = createHash('sha256').update(state).digest('hex');
    expect(row).toMatchObject({
      stateHash: hash, ownerId: f.actor.userId, sessionId: f.actor.sessionId,
      organizationId: f.actor.organizationId, clientId: f.clientId, liveMode: true,
      consumedAt: null, expiresAt: result.expiresAt,
    });
    expect(row.stateHash).not.toBe(state);
    const verifier = f.runtime.cipher.open(['verifier', f.actor.organizationId, f.clientId, 'true', hash], row.verifierCiphertext!);
    expect(row.verifierCiphertext).not.toContain(verifier);
    expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(600000);
  });

  it('replaces the pending state and rejects the superseded callback', async () => {
    const f = await setup();
    const first = await f.start();
    const second = await f.start();
    const exchange = vi.spyOn(f.client, 'exchangeCode').mockResolvedValue(f.credentials);
    expect(second.state).not.toBe(first.state);
    await expect(f.repository.complete(f.identity, first.input)).rejects.toThrow('MERCADO_PAGO_OAUTH_INVALID');
    expect(exchange).not.toHaveBeenCalled();
  });

  it.each(['wrong-owner', 'wrong-session', 'unknown-state', 'invalid-state'] as const)('rejects %s before exchanging a code', async (reason) => {
    const f = await setup();
    const { input } = await f.start();
    const exchange = vi.spyOn(f.client, 'exchangeCode').mockResolvedValue(f.credentials);
    const identity = reason === 'wrong-owner' ? { ...f.identity, userId: randomUUID() }
      : reason === 'wrong-session' ? { ...f.identity, sessionId: randomUUID() } : f.identity;
    const callback = reason === 'unknown-state' ? { ...input, state: 'a'.repeat(43) }
      : reason === 'invalid-state' ? { ...input, state: 'invalid' } : input;
    await expect(f.repository.complete(identity, callback)).rejects.toThrow('MERCADO_PAGO_OAUTH_INVALID');
    expect(exchange).not.toHaveBeenCalled();
    expect(await f.readAttempt()).toMatchObject({ consumedAt: null });
  });

  it('rejects an expired OAuth attempt without consuming it', async () => {
    const f = await setup();
    const { input } = await f.start();
    await context.prisma.mercadoPagoOAuthAttempt.update({
      where: f.attemptWhere,
      data: { createdAt: new Date(Date.now() - 700000), expiresAt: new Date(Date.now() - 1000) },
    });
    const exchange = vi.spyOn(f.client, 'exchangeCode').mockResolvedValue(f.credentials);
    await expect(f.repository.complete(f.identity, input)).rejects.toThrow('MERCADO_PAGO_OAUTH_INVALID');
    expect(exchange).not.toHaveBeenCalled();
  });

  it('consumes the verifier before provider I/O and persists a new connection atomically', async () => {
    const f = await setup();
    await context.prisma.mercadoPagoConnection.delete({ where: f.where });
    const { input } = await f.start();
    const exchange = vi.spyOn(f.client, 'exchangeCode').mockImplementation(async (code, verifier) => {
      expect(code).toBe(input.code);
      expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(await f.readAttempt()).toMatchObject({ consumedAt: expect.any(Date), verifierCiphertext: null });
      return f.credentials;
    });
    expect(await f.repository.complete(f.identity, input)).toEqual({
      organizationId: f.actor.organizationId, organizationName: 'Fixture organization', accountId: f.accountId, liveMode: true,
    });
    const row = await f.readConnection();
    const aad = ['credential', f.actor.organizationId, f.clientId, 'true', f.accountId];
    expect(f.runtime.cipher.open([...aad, 'access'], row.accessTokenCiphertext!)).toBe(f.credentials.accessToken);
    expect(f.runtime.cipher.open([...aad, 'refresh'], row.refreshTokenCiphertext!)).toBe(f.credentials.refreshToken);
    expect(row).toMatchObject({ disconnectedAt: null, refreshClaimId: null, refreshStartedAt: null });
    expect(await context.prisma.mercadoPagoOAuthAttempt.findUnique({ where: f.attemptWhere })).toBeNull();
    await expect(f.repository.complete(f.identity, input)).rejects.toThrow('MERCADO_PAGO_OAUTH_INVALID');
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('does not exchange a consumed code a second time after an uncertain provider failure', async () => {
    const f = await setup();
    const { input } = await f.start();
    const exchange = vi.spyOn(f.client, 'exchangeCode').mockRejectedValue(new Error('fixture timeout'));
    await expect(f.repository.complete(f.identity, input)).rejects.toThrow('MERCADO_PAGO_UNAVAILABLE');
    expect(await f.readAttempt()).toMatchObject({ consumedAt: expect.any(Date), verifierCiphertext: null });
    await expect(f.repository.complete(f.identity, input)).rejects.toThrow('MERCADO_PAGO_OAUTH_INVALID');
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('rejects concurrent callbacks for the same authorization attempt', async () => {
    const f = await setup();
    const { input } = await f.start();
    const exchange = vi.spyOn(f.client, 'exchangeCode').mockImplementation(async () => {
      await expect(f.repository.complete(f.identity, input)).rejects.toThrow('MERCADO_PAGO_OAUTH_INVALID');
      return f.credentials;
    });
    await expect(f.repository.complete(f.identity, input)).resolves.toMatchObject({ accountId: f.accountId });
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it.each(['mode', 'expiry'] as const)('rejects provider credentials with an incompatible %s', async (field) => {
    const f = await setup();
    const { input } = await f.start();
    const credentials = field === 'mode' ? { ...f.credentials, liveMode: false }
      : { ...f.credentials, expiresAt: new Date(Date.now() - 1000) };
    vi.spyOn(f.client, 'exchangeCode').mockResolvedValue(credentials);
    const before = await f.readConnection();
    await expect(f.repository.complete(f.identity, input)).rejects.toThrow('MERCADO_PAGO_OAUTH_INVALID');
    expect(await f.readConnection()).toMatchObject({ accessTokenCiphertext: before.accessTokenCiphertext });
  });

  it('rejects a different seller account even for the same owner', async () => {
    const f = await setup();
    const { input } = await f.start();
    vi.spyOn(f.client, 'exchangeCode').mockResolvedValue({ ...f.credentials, accountId: '99999' });
    await expect(f.repository.complete(f.identity, input)).rejects.toThrow('MERCADO_PAGO_ACCOUNT_CONFLICT');
    expect(await f.readConnection()).toMatchObject({ accountId: f.accountId });
  });

  it('does not attach a seller account already bound to another organization', async () => {
    const f = await setup();
    const other = await context.liveFixture();
    await context.prisma.mercadoPagoConnection.delete({ where: f.where });
    const { input } = await f.start();
    vi.spyOn(f.client, 'exchangeCode').mockResolvedValue({ ...f.credentials, accountId: other.accountId });
    await expect(f.repository.complete(f.identity, input)).rejects.toThrow('MERCADO_PAGO_ACCOUNT_CONFLICT');
    expect(await context.prisma.mercadoPagoConnection.findUnique({ where: f.where })).toBeNull();
  });

  it('revalidates the session after provider I/O and never persists credentials for a revoked session', async () => {
    const f = await setup();
    const { input } = await f.start();
    const before = await f.readConnection();
    vi.spyOn(f.client, 'exchangeCode').mockImplementation(async () => {
      await context.prisma.authSession.update({
        where: { id: f.actor.sessionId }, data: { revokedAt: new Date(), revocationReason: 'LOGOUT' },
      });
      return f.credentials;
    });
    await expect(f.repository.complete(f.identity, input)).rejects.toThrow('MERCADO_PAGO_OAUTH_INVALID');
    expect(await f.readConnection()).toMatchObject({ accessTokenCiphertext: before.accessTokenCiphertext });
    await expect(f.start()).rejects.toThrow('MERCADO_PAGO_OAUTH_INVALID');
    await expect(f.repository.disconnect(f.actor)).rejects.toThrow('MERCADO_PAGO_OAUTH_INVALID');
  });

  it('disconnects idempotently and removes both credentials and the pending attempt', async () => {
    const f = await setup();
    await f.start();
    await f.repository.disconnect(f.actor);
    const row = await f.readConnection();
    expect(row).toMatchObject({
      disconnectedAt: expect.any(Date), expiresAt: null, accessTokenCiphertext: null, refreshTokenCiphertext: null,
    });
    await f.repository.disconnect(f.actor);
    expect(await f.readConnection()).toMatchObject({ disconnectedAt: row.disconnectedAt });
    expect(await context.prisma.mercadoPagoOAuthAttempt.findUnique({ where: f.attemptWhere })).toBeNull();
    expect(await f.repository.read(f.actor)).toMatchObject({ status: 'DISCONNECTED', canDisconnect: false });
  });

  it('blocks new OAuth after platform access expires but allows the owner to disconnect', async () => {
    const f = await setup();
    await context.prisma.organizationTrial.update({
      where: { organizationId: f.actor.organizationId }, data: { revokedAt: new Date() },
    });
    expect(await f.repository.read(f.actor)).toMatchObject({ canConnect: false, canDisconnect: true });
    await expect(f.start()).rejects.toThrow('SUBSCRIPTION_REQUIRED');
    await expect(f.repository.disconnect(f.actor)).resolves.toBeUndefined();
  });
});
