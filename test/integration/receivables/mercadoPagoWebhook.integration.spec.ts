import 'reflect-metadata';

import { createHash, randomInt, randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../../src/infrastructure/database/prisma.service.js';
import { MercadoPagoConnectionRuntime } from '../../../src/modules/receivables/infrastructure/providers/mercadoPago/mercadoPagoConnectionRuntime.js';
import { PrismaMercadoPagoWebhookRepository } from '../../../src/modules/receivables/infrastructure/transactions/prismaMercadoPagoWebhookRepository.js';

const url = process.env.PAYMENT_INTEGRATION_DATABASE_URL;
const suite = url === undefined ? describe.skip : describe;

function disposableDatabaseUrl(): string {
  if (!url) throw new Error('Missing dedicated payment integration database URL');
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.pathname !== '/bom_trato_ci' ||
    parsed.username !== 'bom_trato_ci' ||
    parsed.searchParams.get('schema') !== 'public'
  ) {
    throw new Error('Webhook integration tests require the disposable local bom_trato_ci database');
  }
  return url;
}

suite('Mercado Pago webhook inbox (disposable PostgreSQL)', () => {
  let prisma: PrismaService;
  let repository: PrismaMercadoPagoWebhookRepository;
  const clientIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService({ url: disposableDatabaseUrl() });

    await prisma.$connect();
    const runtime = new MercadoPagoConnectionRuntime({
      enabled: false,
      liveMode: false,
      sandboxPixEnabled: false,
      clientId: undefined,
      clientSecret: undefined,
      encryptionKey: undefined,
      redirectUri: 'https://example.invalid/mercado-pago/callback',
    });
    repository = new PrismaMercadoPagoWebhookRepository(prisma, runtime);
  });

  afterEach(async () => {
    if (!prisma) return;

    await prisma.mercadoPagoWebhookEvent.deleteMany({ where: { clientId: { in: clientIds.splice(0) } } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  function notice() {
    const clientId = String(randomInt(1_000_000_000, 9_999_999_999));
    clientIds.push(clientId);

    return {
      clientId,
      deliveryKey: createHash('sha256').update(randomUUID()).digest('hex'),
      paymentId: '123456789',
      requestId: randomUUID(),
      signedAt: new Date(),
    };
  }

  it('deduplicates concurrent deliveries and only one worker obtains the lease', async () => {
    const event = notice();

    await Promise.all([
      repository.enqueue(event),
      repository.enqueue(event),
      repository.enqueue(event)
    ]);

    expect(await prisma.mercadoPagoWebhookEvent.count({ where: { clientId: event.clientId } })).toBe(1);

    const claims = await Promise.all([
      repository.claim(event.clientId, randomUUID()),
      repository.claim(event.clientId, randomUUID()),
    ]);

    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
    expect(await repository.claim(event.clientId, randomUUID())).toBeNull();
  });

  it('recovers an expired lease and rejects stale completion', async () => {
    const event = notice();
    const key = { clientId_deliveryKey: { clientId: event.clientId, deliveryKey: event.deliveryKey } };

    await repository.enqueue(event);
    const original = await repository.claim(event.clientId, randomUUID());
    if (original === null) throw new Error('Fixture claim failed');

    await prisma.mercadoPagoWebhookEvent.update({
      where: key,
      data: { leaseExpiresAt: new Date(Date.now() - 60_000) }
    });
    const replacement = await repository.claim(event.clientId, randomUUID());
    if (replacement === null) throw new Error('Expired claim was not recovered');

    expect(await repository.settle(original, { kind: 'RETRY', code: 'UNMATCHED_PAYMENT' })).toBe(false);
    expect(await repository.settle(replacement, { kind: 'RETRY', code: 'UNMATCHED_PAYMENT' })).toBe(true);

    const stored = await prisma.mercadoPagoWebhookEvent.findUniqueOrThrow({ where: key });

    expect(stored).toMatchObject({
      attempts: 1,
      leaseToken: null,
      leaseExpiresAt: null,
      processedAt: null,
      reviewRequiredAt: null,
      resultCode: 'UNMATCHED_PAYMENT',
    });
    expect(stored.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('preserves exhausted unmatched events and scopes claims to their application', async () => {
    const event = notice();
    const other = notice();
    const key = { clientId_deliveryKey: { clientId: event.clientId, deliveryKey: event.deliveryKey } };

    await repository.enqueue(event);
    await repository.enqueue(other);
    await prisma.mercadoPagoWebhookEvent.update({ where: key, data: { attempts: 24 } });

    const claimed = await repository.claim(event.clientId, randomUUID());
    if (claimed === null) throw new Error('Fixture claim failed');

    expect(claimed.clientId).toBe(event.clientId);
    expect(await repository.settle(claimed, { kind: 'RETRY', code: 'UNMATCHED_PAYMENT' })).toBe(true);

    const stored = await prisma.mercadoPagoWebhookEvent.findUniqueOrThrow({ where: key });

    expect(stored).toMatchObject({ attempts: 25, processedAt: null, resultCode: 'UNMATCHED_PAYMENT' });
    expect(stored.reviewRequiredAt).toBeInstanceOf(Date);
    expect(await repository.claim(event.clientId, randomUUID())).toBeNull();
    expect(await repository.claim(other.clientId, randomUUID())).toMatchObject({ clientId: other.clientId });
  });
});
