import { describe, expect, it } from 'vitest';

import { asymmetric } from '../../../../../test/support/asymmetricMatchers.js';
import type { RegisterUserParams } from '../../domain/repositories/auth.repository.js';

import { authFixture, google, now, user } from './support/prismaAuth.fixture.js';

const legalAcceptance = {
  termsVersion: 'fixture-v1',
  privacyNoticeVersion: 'fixture-v1',
  source: 'PASSWORD_REGISTER' as const,
  ipAddress: null,
  userAgent: null,
  acceptedAt: now,
};
const registration: RegisterUserParams = {
  name: user.name,
  email: user.email,
  passwordHash: user.passwordHash,
  selectedPlanPriceId: null,
  tokenHash: 'verification-hash',
  expiresAt: new Date(now.getTime() + 600000),
  legalAcceptance,
};

describe('PrismaAuthRepository identity persistence', () => {
  it('registers a password account with verification and legal consent in one nested write', async () => {
    const { repository, db } = authFixture();

    expect(await repository.register(registration)).toBe(true);
    expect(db.planPrice.findFirst).not.toHaveBeenCalled();
    expect(db.user.create).toHaveBeenCalledWith({
      data: {
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        selectedPlanPriceId: null,
        authActionTokens: {
          create: { purpose: 'VERIFY_EMAIL', tokenHash: registration.tokenHash, expiresAt: registration.expiresAt },
        },
        termsAcceptances: { create: legalAcceptance },
      },
      select: { id: true },
    });
  });

  it('rejects unpublished prices before creating users and maps only unique conflicts to false', async () => {
    const { repository, db } = authFixture();
    db.planPrice.findFirst.mockResolvedValueOnce(null);

    await expect(repository.register({ ...registration, selectedPlanPriceId: 'missing' })).rejects.toThrow(
      'PLAN_UNAVAILABLE',
    );
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.planPrice.findFirst).toHaveBeenCalledWith({
      where: { id: 'missing', published: true, stripeActive: true, plan: { published: true, stripeActive: true } },
      select: { id: true },
    });

    db.user.create.mockRejectedValueOnce({ code: 'P2002' });
    expect(await repository.register(registration)).toBe(false);

    const failure = new Error('Fixture connection error');
    db.user.create.mockRejectedValueOnce(failure);
    await expect(repository.register(registration)).rejects.toBe(failure);
  });

  it('creates federated accounts without passwords and maps identity conflicts', async () => {
    const { repository, db } = authFixture();
    const input = {
      userId: user.id,
      name: user.name,
      email: user.email,
      emailVerifiedAt: now,
      selectedPlanPriceId: null,
      identity: google,
      legalAcceptance: { ...legalAcceptance, source: 'GOOGLE_REGISTER' as const },
    };

    expect((await repository.registerFederated(input)).id).toBe(user.id);
    expect(db.user.create).toHaveBeenCalledWith(
      asymmetric.objectContaining({
        data: asymmetric.objectContaining({
          id: user.id,
          passwordHash: null,
          emailVerifiedAt: now,
          authIdentities: {
            create: { id: google.id, provider: google.provider, providerAccountId: google.providerAccountId },
          },
          termsAcceptances: { create: input.legalAcceptance },
        }),
      }),
    );

    db.user.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(repository.registerFederated(input)).rejects.toThrow('GOOGLE_IDENTITY_CONFLICT');
  });

  it('resolves accounts by exact provider identity and lists only provider names', async () => {
    const { repository, db } = authFixture();
    db.authIdentity.findUnique.mockResolvedValueOnce({ user });
    db.authIdentity.findMany.mockResolvedValueOnce([{ provider: 'GOOGLE' }]);

    expect((await repository.findUserByEmail(user.email))?.id).toBe(user.id);
    expect((await repository.findUserByIdentity('GOOGLE', google.providerAccountId))?.id).toBe(user.id);
    expect(await repository.findUserByIdentity('GOOGLE', 'missing')).toBeNull();
    expect(await repository.listIdentityProviders(user.id)).toEqual(['GOOGLE']);
    expect(db.authIdentity.findMany).toHaveBeenCalledWith({
      where: { userId: user.id },
      select: { provider: true },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('locks the user before linking and treats an existing identical link as idempotent', async () => {
    const { repository, db } = authFixture();

    await repository.linkIdentity(google);

    expect(db.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    expect(db.$queryRaw.mock.calls[0][1]).toBe(user.id);
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.authIdentity.create.mock.invocationCallOrder[0]);
    expect(db.authIdentity.create).toHaveBeenCalledWith({ data: google, select: { id: true } });

    db.authIdentity.findUnique.mockResolvedValueOnce({ userId: user.id });
    await repository.linkIdentity(google);

    expect(db.authIdentity.create).toHaveBeenCalledTimes(1);
  });

  it('blocks foreign identities, duplicate providers and missing users', async () => {
    const { repository, db } = authFixture();
    db.authIdentity.findUnique.mockResolvedValueOnce({ userId: 'other' });

    await expect(repository.linkIdentity(google)).rejects.toThrow('GOOGLE_IDENTITY_IN_USE');

    db.authIdentity.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ providerAccountId: 'different' });
    await expect(repository.linkIdentity(google)).rejects.toThrow('GOOGLE_PROVIDER_ALREADY_LINKED');

    db.user.findUnique.mockResolvedValueOnce(null);
    await expect(repository.linkIdentity(google)).rejects.toThrow('INVALID_SESSION');

    expect(db.authIdentity.create).not.toHaveBeenCalled();
  });
});
