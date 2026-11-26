import { createHash } from 'node:crypto';

import { expect, it } from 'vitest';

import type { SaveReceivingSettingsInput } from '../../../src/modules/receivables/domain/types/receivingSettings.types.js';
import { ReceivingSettingsCipher } from '../../../src/modules/receivables/infrastructure/security/receivingSettingsCipher.js';
import { PrismaReceivablePaymentLinkRepository } from '../../../src/modules/receivables/infrastructure/transactions/prismaReceivablePaymentLinkRepository.js';
import { PrismaReceivingSettingsRepository } from '../../../src/modules/receivables/infrastructure/transactions/prismaReceivingSettingsRepository.js';

import { createPaymentFixture, paymentIntegrationSuite } from './support/payment.fixture.js';

const input: SaveReceivingSettingsInput = {
  pixEnabled: true,
  pixKeyType: 'EMAIL',
  pixKey: '  FIXTURE@EXAMPLE.INVALID  ',
  merchantName: 'Fixture Merchant',
  merchantCity: 'Uberlandia',
  version: 0,
  confirmed: true,
};
const disabled: SaveReceivingSettingsInput = {
  pixEnabled: false,
  pixKeyType: null,
  pixKey: null,
  merchantName: null,
  merchantCity: null,
  version: 0,
  confirmed: false,
};

paymentIntegrationSuite('receiving settings and payment links (disposable PostgreSQL)', () => {
  const context = createPaymentFixture();

  async function setup(configure = true) {
    const { prisma, fixture } = context;
    const f = await fixture();
    const cipher = new ReceivingSettingsCipher('a'.repeat(64));
    const settings = new PrismaReceivingSettingsRepository(prisma, cipher);
    const links = new PrismaReceivablePaymentLinkRepository(prisma, cipher);

    if (configure) await settings.save(f.actor, input);

    return { ...f, settings, links, cipher };
  }

  it('reads default settings without creating a database row', async () => {
    const f = await setup(false);

    expect(await f.settings.read(f.actor)).toEqual({
      pixEnabled: false, pixKeyType: null, pixKey: null, merchantName: null, merchantCity: null,
      version: 0, canConfigure: true, encryptionAvailable: true,
    });
    expect(await context.prisma.organizationReceivingSettings.findUnique({
      where: { organizationId: f.actor.organizationId },
    })).toBeNull();
    expect(await f.links.status(f.actor)).toBeNull();
  });

  it('normalizes and encrypts settings before persisting them and reads back the original destination', async () => {
    const f = await setup();
    const row = await context.prisma.organizationReceivingSettings.findUniqueOrThrow({
      where: { organizationId: f.actor.organizationId },
    });

    expect(row).toMatchObject({
      pixEnabled: true, pixKeyType: 'EMAIL', merchantName: 'FIXTURE MERCHANT', merchantCity: 'UBERLANDIA',
      version: 1, updatedById: f.actor.userId,
    });
    expect(row.pixKeyCiphertext).not.toContain('fixture@example.invalid');
    expect(f.cipher.decrypt(f.actor.organizationId, 'EMAIL', row.pixKeyCiphertext!)).toBe('fixture@example.invalid');
    expect(await f.settings.read(f.actor)).toMatchObject({ pixKey: 'fixture@example.invalid', version: 1 });
  });

  it('allows exactly one concurrent update at the same version', async () => {
    const f = await setup();
    const results = await Promise.allSettled([
      f.settings.save(f.actor, { ...input, version: 1, merchantName: 'First merchant' }),
      f.settings.save(f.actor, { ...input, version: 1, merchantName: 'Second merchant' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ status: 'rejected', reason: { code: 'RECEIVING_SETTINGS_VERSION_CONFLICT' } });
    expect(await f.settings.read(f.actor)).toMatchObject({ version: 2 });
  });

  it('clears encrypted destination data when disabling Pix', async () => {
    const f = await setup();

    expect(await f.settings.save(f.actor, { ...disabled, version: 1 })).toMatchObject({ pixEnabled: false, version: 2 });
    expect(await context.prisma.organizationReceivingSettings.findUniqueOrThrow({
      where: { organizationId: f.actor.organizationId },
    })).toMatchObject({ pixKeyType: null, pixKeyCiphertext: null, merchantName: null, merchantCity: null });
    await expect(f.links.create(f.actor, f.receivable.version)).rejects.toThrow('PIX_DESTINATION_NOT_CONFIGURED');
  });

  it('denies nonmembers and nonowner members access to receiving settings and payment links', async () => {
    const f = await setup();
    const other = await context.fixture();
    const actor = { ...f.actor, userId: other.actor.userId };

    await expect(f.settings.read(actor)).rejects.toThrow('MEMBER_REQUIRED');
    await context.prisma.organizationMember.create({
      data: { organizationId: f.actor.organizationId, userId: other.actor.userId, role: 'MEMBER' },
    });
    await expect(f.settings.read(actor)).rejects.toThrow('OWNER_REQUIRED');
    await expect(f.settings.save(actor, { ...input, version: 1 })).rejects.toThrow('OWNER_REQUIRED');
    await expect(f.links.status(actor)).rejects.toThrow('OWNER_REQUIRED');
    await expect(f.links.create(actor, f.receivable.version)).rejects.toThrow('OWNER_REQUIRED');
    await expect(f.links.revoke(actor)).rejects.toThrow('OWNER_REQUIRED');
  });

  it('preserves read access but blocks writes and new links after trial access ends', async () => {
    const f = await setup();
    const link = await f.links.create(f.actor, f.receivable.version);
    await context.prisma.organizationTrial.update({
      where: { organizationId: f.actor.organizationId }, data: { revokedAt: new Date() },
    });

    expect(await f.settings.read(f.actor)).toMatchObject({ canConfigure: false, version: 1 });
    await expect(f.settings.save(f.actor, { ...input, version: 1 })).rejects.toThrow('SUBSCRIPTION_REQUIRED');
    await expect(f.links.create(f.actor, f.receivable.version)).rejects.toThrow('SUBSCRIPTION_REQUIRED');
    expect(await f.links.status(f.actor)).toMatchObject({ active: false });
    await expect(f.links.resolve(link.token)).rejects.toThrow('PAYMENT_LINK_UNAVAILABLE');
    await expect(f.links.revoke(f.actor)).resolves.toBeUndefined();
  });

  it('fails closed when encryption is unavailable and does not persist an unencrypted key', async () => {
    const f = await setup(false);
    const repository = new PrismaReceivingSettingsRepository(context.prisma, new ReceivingSettingsCipher(undefined));

    expect(await repository.read(f.actor)).toMatchObject({ canConfigure: false, encryptionAvailable: false });
    await expect(repository.save(f.actor, input)).rejects.toThrow('RECEIVING_SETTINGS_UNAVAILABLE');
    expect(await context.prisma.organizationReceivingSettings.findUnique({
      where: { organizationId: f.actor.organizationId },
    })).toBeNull();
  });

  it('rejects stale receivable versions before creating a payment link', async () => {
    const f = await setup();

    await expect(f.links.create(f.actor, f.receivable.version + 1)).rejects.toThrow('PAYMENT_LINK_VERSION_CONFLICT');
    expect(await f.links.status(f.actor)).toBeNull();
  });

  it('stores only the token hash and exposes the bounded payment fields', async () => {
    const f = await setup();
    const link = await f.links.create(f.actor, f.receivable.version);
    const row = await context.prisma.receivablePaymentLink.findUniqueOrThrow({
      where: { receivableId: f.receivable.id },
    });
    expect(link.token).toMatch(/^[a-f0-9]{64}$/);
    expect(row.tokenHash).toBe(createHash('sha256').update(link.token).digest('hex'));
    expect(row.tokenHash).not.toBe(link.token);
    expect(await f.links.status(f.actor)).toEqual({ active: true, expiresAt: link.expiresAt });
    const publicLink = await f.links.resolve(link.token);
    expect(publicLink).toEqual({
      organizationName: 'Fixture organization', merchantName: 'FIXTURE MERCHANT',
      amountInCents: 10_000, currency: 'brl', copyAndPaste: expect.any(String), expiresAt: link.expiresAt,
    });
    expect(publicLink.copyAndPaste).toContain('fixture@example.invalid');
  });

  it('replaces an existing token and rejects the superseded link', async () => {
    const f = await setup();
    const first = await f.links.create(f.actor, f.receivable.version);
    const second = await f.links.create(f.actor, f.receivable.version);

    expect(first.token).not.toBe(second.token);
    await expect(f.links.resolve(first.token)).rejects.toThrow('PAYMENT_LINK_UNAVAILABLE');
    expect(await f.links.resolve(second.token)).toMatchObject({ amountInCents: 10_000 });
    expect(await context.prisma.receivablePaymentLink.count({ where: { receivableId: f.receivable.id } })).toBe(1);
  });

  it('revokes links idempotently and never resolves a revoked token', async () => {
    const f = await setup();
    const link = await f.links.create(f.actor, f.receivable.version);

    await f.links.revoke(f.actor);
    const revoked = await context.prisma.receivablePaymentLink.findUniqueOrThrow({ where: { receivableId: f.receivable.id } });
    await f.links.revoke(f.actor);
    expect(await context.prisma.receivablePaymentLink.findUniqueOrThrow({ where: { receivableId: f.receivable.id } }))
      .toMatchObject({ revokedAt: revoked.revokedAt });
    expect(await f.links.status(f.actor)).toMatchObject({ active: false });
    await expect(f.links.resolve(link.token)).rejects.toThrow('PAYMENT_LINK_UNAVAILABLE');
  });

  it('invalidates a published link after the receiving destination changes', async () => {
    const f = await setup();
    const link = await f.links.create(f.actor, f.receivable.version);
    await f.settings.save(f.actor, { ...input, version: 1, pixKey: 'other@example.invalid' });

    expect(await f.links.status(f.actor)).toMatchObject({ active: false });
    await expect(f.links.resolve(link.token)).rejects.toThrow('PAYMENT_LINK_UNAVAILABLE');
  });

  it('invalidates a published link after the receivable version changes', async () => {
    const f = await setup();
    const link = await f.links.create(f.actor, f.receivable.version);
    await context.prisma.receivable.update({
      where: { id: f.receivable.id }, data: { version: { increment: 1 } },
    });

    expect(await f.links.status(f.actor)).toMatchObject({ active: false });
    await expect(f.links.resolve(link.token)).rejects.toThrow('PAYMENT_LINK_UNAVAILABLE');
  });

  it('rejects access using a receivable identifier from a different organization', async () => {
    const f = await setup();
    const other = await context.fixture();
    const actor = { ...f.actor, receivableId: other.receivable.id };

    await expect(f.links.create(actor, other.receivable.version)).rejects.toThrow('RECEIVABLE_NOT_FOUND');
    expect(await f.links.status(actor)).toBeNull();
  });

  it.each(['', 'A'.repeat(64), 'a'.repeat(63), 'f'.repeat(64)])('rejects invalid or unknown public tokens uniformly', async (token) => {
    const f = await setup(false);
    await expect(f.links.resolve(token)).rejects.toThrow('PAYMENT_LINK_UNAVAILABLE');
  });
});
