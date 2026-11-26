import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { MercadoPagoSandboxPixActor } from '../../application/types/mercadoPagoSandboxPix.types.js';
import { pixCrc16 } from '../../domain/policies/receivablePixCharge.policy.js';
import { MercadoPagoConnectionRuntime } from '../providers/mercadoPago/mercadoPagoConnectionRuntime.js';

import type { MercadoPagoCredentialService } from './mercadoPagoCredentialService.js';
import { PrismaMercadoPagoSandboxPixRepository } from './prismaMercadoPagoSandboxPixRepository.js';

vi.mock('../../../organizations/infrastructure/transactions/organizationTransaction.js', () => ({
  organizationTransaction: async (
    prisma: { transact: (operation: (db: unknown) => Promise<unknown>) => Promise<unknown> },
    _organizationId: string,
    _mode: string,
    operation: (db: unknown) => Promise<unknown>,
  ) => prisma.transact(operation),
}));

vi.mock('../access/assertReceivingSettingsOwner.js', () => ({
  assertReceivingSettingsOwner: vi.fn().mockResolvedValue({
    hasPlatformAccess: true,
    billingNeedsReconciliation: false
  }),
}));

const actor: MercadoPagoSandboxPixActor = {
  organizationId: 'organization',
  userId: 'owner',
  sessionId: 'session',
  receivableId: 'receivable',
};
const input = {
  version: 1,
  testBuyerEmail: 'buyer@example.com',
  testDocumentType: 'CPF' as const,
  testDocumentNumber: '19119119100',
  confirmed: true,
};

interface Issuance {
  id: string;
  organizationId: string;
  receivableId: string;
  receivableVersion: number;
  accountId: string;
  clientId: string;
  issuedById: string;
  amountInCents: number;
  status: 'RESERVED' | 'PENDING' | 'REVIEW_REQUIRED';
  externalPaymentId: string | null;
  copyAndPasteCiphertext: string | null;
  requestedExpiresAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
}

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, '0') + value;
}
function testCode(): string {
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

function fixture() {
  const runtime = new MercadoPagoConnectionRuntime({
    enabled: true,
    sandboxPixEnabled: true,
    liveMode: false,
    clientId: '123',
    clientSecret: 'fixture-secret',
    encryptionKey: 'a'.repeat(64),
    redirectUri: 'https://example.com/mercado-pago/callback',
  });
  const access = {
    accountId: '456',
    accessToken: 'fixture-access',
    liveMode: false,
    expiresAt: new Date(Date.now() + 3600000)
  };
  const connection = {
    accountId: access.accountId,
    connectedById: actor.userId,
    clientId: '123',
    liveMode: false,
    disconnectedAt: null as Date | null,
    expiresAt: access.expiresAt,
    accessTokenCiphertext: runtime.cipher.seal(
      [
        'credential',
        actor.organizationId,
        '123',
        'false',
        access.accountId,
        'access'
      ],
      access.accessToken
    ),
    refreshTokenCiphertext: 'fixture-refresh-ciphertext',
    refreshClaimId: null,
    refreshStartedAt: null,
  };
  const receivable = {
    version: 1,
    status: 'OPEN',
    currency: 'brl',
    amountInCents: 10000,
    receivedInCents: 0
  };
  let stored: Issuance | null = null;
  let transaction: Promise<unknown> = Promise.resolve();
  let inTransaction = false;
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: actor.sessionId }]),
    receivable: { findFirst: vi.fn(async () => receivable) },
    mercadoPagoConnection: { findUnique: vi.fn(async () => connection) },
    mercadoPagoOAuthAttempt: { findUnique: vi.fn().mockResolvedValue(null) },
    mercadoPagoSandboxPix: {
      findUnique: vi.fn(async () => stored),
      create: vi.fn(async ({ data }: {
        data: Omit<Issuance,
        'status' | 'externalPaymentId' | 'copyAndPasteCiphertext' | 'expiresAt'>
      }) => {
        if (stored !== null) throw new Error('duplicate reservation');
        stored = {
          ...data,
          status: 'RESERVED',
          externalPaymentId: null,
          copyAndPasteCiphertext: null,
          expiresAt: null
        };

        return stored;
      }),
      updateMany: vi.fn(async ({ data }: { data: Partial<Issuance> }) => {
        if (stored === null || stored.status !== 'RESERVED') return { count: 0 };
        stored = { ...stored, ...data };

        return { count: 1 };
      }),
    },
  };
  const prisma = {
    transact(operation: (db: unknown) => Promise<unknown>) {
      const result = transaction.then(async () => {
        inTransaction = true;
        try {
          return await operation(db);
        } finally {
          inTransaction = false;
        }
      });
      transaction = result.catch(() => undefined);

      return result;
    },
  };
  const credentials = { accessForOwner: vi.fn().mockResolvedValue(access) };
  const create = vi.spyOn(runtime.requireEnabled().client, 'createSandboxPix').mockImplementation(async (request) => {
    expect(stored?.id).toBe(request.issuanceId);
    expect(stored?.status).toBe('RESERVED');
    expect(inTransaction).toBe(false);

    return {
      kind: 'PENDING',
      accountId: request.accountId,
      issuanceId: request.issuanceId,
      paymentId: '789',
      amountInCents: request.amountInCents,
      liveMode: false,
      currency: 'brl',
      copyAndPaste: testCode(),
      expiresAt: request.expiresAt,
    };
  });
  const repository = new PrismaMercadoPagoSandboxPixRepository(
    prisma as unknown as PrismaService, runtime, credentials as unknown as MercadoPagoCredentialService,
  );

  return {
    repository,
    create,
    db,
    receivable,
    connection,
    stored: () => stored
  };
}

describe('sandbox Pix repository orchestration (mock transaction store)', () => {
  it('reserves before provider I/O, stores an encrypted QR, and reuses the reservation', async () => {
    const { repository, create, db, stored } = fixture();

    const result = await repository.issue(actor, input);

    expect(result.status).toBe('PENDING');
    expect(result.copyAndPaste).toBe(testCode());
    expect(stored()?.copyAndPasteCiphertext).not.toContain(testCode());
    expect(stored()).not.toHaveProperty('testBuyerEmail');
    expect(stored()).not.toHaveProperty('testDocumentNumber');
    expect(await repository.issue(actor, input)).toEqual(result);
    expect(db.mercadoPagoSandboxPix.create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not create again after an uncertain provider outcome', async () => {
    const { repository, create, stored } = fixture();
    create.mockRejectedValueOnce(new Error('timeout'));

    const result = await repository.issue(actor, input);

    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.copyAndPaste).toBeNull();
    expect(stored()?.status).toBe('REVIEW_REQUIRED');
    expect((await repository.issue(actor, input)).issuanceId).toBe(result.issuanceId);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('hides the previously issued QR when the balance or seller connection changes', async () => {
    const { repository, receivable, connection } = fixture();

    expect((await repository.issue(actor, input)).status).toBe('PENDING');

    receivable.version++;

    expect(await repository.read(actor)).toMatchObject({ status: 'STALE', copyAndPaste: null, canIssue: false });

    receivable.version--;
    connection.disconnectedAt = new Date();

    expect(await repository.read(actor)).toMatchObject({ status: 'STALE', copyAndPaste: null, canIssue: false });
  });

  it('does not call the provider for an outdated receivable version', async () => {
    const { repository, create, db } = fixture();

    await expect(repository.issue(actor, { ...input, version: 2 })).rejects.toThrow('MERCADO_PAGO_PIX_CONFLICT');
    expect(db.mercadoPagoSandboxPix.create).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
