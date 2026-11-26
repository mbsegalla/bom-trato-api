import { describe, expect, it } from 'vitest';

import { authFixture, now, user } from './support/prismaAuth.fixture.js';

const token = {
  id: 'action',
  userId: user.id,
  purpose: 'RESET_PASSWORD' as const,
  expiresAt: new Date(now.getTime() + 600000),
  usedAt: null,
  user,
};
const request = { email: user.email, purpose: token.purpose, tokenHash: 'action-hash', expiresAt: token.expiresAt };
const reset = { tokenHash: request.tokenHash, purpose: token.purpose, now, passwordHash: 'new-password-hash' };

describe('PrismaAuthRepository action token persistence', () => {
  it('does not issue tokens for missing, disabled or already verified accounts', async () => {
    const { repository, db } = authFixture();
    db.user.findUnique.mockResolvedValueOnce(null);

    expect(await repository.issueAction(request)).toBe(false);

    db.user.findUnique.mockResolvedValueOnce({ id: user.id }).mockResolvedValueOnce({ ...user, disabledAt: now });
    expect(await repository.issueAction(request)).toBe(false);
    expect(await repository.issueAction({ ...request, purpose: 'VERIFY_EMAIL' })).toBe(false);
    expect(db.authActionToken.create).not.toHaveBeenCalled();
    expect(db.authActionToken.updateMany).not.toHaveBeenCalled();
  });

  it('invalidates old tokens of the same purpose under the lock before issuance', async () => {
    const { repository, db } = authFixture();

    expect(await repository.issueAction(request)).toBe(true);
    expect(db.authActionToken.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, purpose: request.purpose, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(db.authActionToken.create).toHaveBeenCalledWith({
      data: { userId: user.id, purpose: request.purpose, tokenHash: request.tokenHash, expiresAt: request.expiresAt },
    });
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.authActionToken.updateMany.mock.invocationCallOrder[0]!);
  });

  it('updates the password, revokes active sessions and consumes remaining reset tokens together', async () => {
    const { repository, db, transaction } = authFixture();
    db.authActionToken.findUnique.mockResolvedValueOnce({ userId: user.id }).mockResolvedValueOnce(token);

    expect(await repository.consumeAction(reset)).toBe(user.email);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: user.id }, data: { passwordHash: reset.passwordHash } });
    expect(db.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now, revocationReason: 'PASSWORD_RESET' },
    });
    expect(db.authActionToken.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, purpose: 'RESET_PASSWORD', usedAt: null },
      data: { usedAt: now },
    });
  });

  it('verifies email without revoking unrelated sessions or resetting the password', async () => {
    const { repository, db } = authFixture();
    db.authActionToken.findUnique.mockResolvedValueOnce({ userId: user.id }).mockResolvedValueOnce({
      ...token, purpose: 'VERIFY_EMAIL', user: { ...user, emailVerifiedAt: null },
    });

    expect(await repository.consumeAction({ tokenHash: reset.tokenHash, purpose: 'VERIFY_EMAIL', now })).toBe(user.email);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: user.id }, data: { emailVerifiedAt: now } });
    expect(db.authSession.updateMany).not.toHaveBeenCalled();
  });

  it.each([{ usedAt: now }, { expiresAt: now }, { purpose: 'VERIFY_EMAIL' }])(
    'rejects invalid action token state: %j',
    async (override) => {
      const { repository, db } = authFixture();
      db.authActionToken.findUnique.mockResolvedValueOnce({ userId: user.id }).mockResolvedValueOnce({ ...token, ...override });

      await expect(repository.consumeAction(reset)).rejects.toThrow('INVALID_TOKEN');
      expect(db.user.update).not.toHaveBeenCalled();
      expect(db.authSession.updateMany).not.toHaveBeenCalled();
      expect(db.authActionToken.updateMany).not.toHaveBeenCalled();
    },
  );

  it('rejects a reset without a new password hash', async () => {
    const { repository, db } = authFixture();
    db.authActionToken.findUnique.mockResolvedValueOnce({ userId: user.id }).mockResolvedValueOnce(token);

    await expect(repository.consumeAction({ tokenHash: reset.tokenHash, purpose: reset.purpose, now })).rejects.toThrow('INVALID_TOKEN');
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
