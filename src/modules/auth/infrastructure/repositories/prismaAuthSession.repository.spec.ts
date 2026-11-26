import { describe, expect, it } from 'vitest';

import { authFixture, identity, now, session, user } from './support/prismaAuth.fixture.js';

const refreshHash = 'refresh-hash';
const start = { session, expectedPasswordHash: user.passwordHash, refreshHash };

describe('PrismaAuthRepository session persistence', () => {
  it('checks the current password before creating a session and its refresh token', async () => {
    const { repository, db } = authFixture();
    db.user.findUnique.mockResolvedValueOnce({ ...user, passwordHash: 'changed' });

    await expect(repository.startSession(start)).rejects.toThrow('INVALID_CREDENTIALS');
    expect(db.authSession.create).not.toHaveBeenCalled();

    await repository.startSession(start);
    expect(db.authSession.create).toHaveBeenCalledWith({
      data: { ...session, refreshTokens: { create: { tokenHash: refreshHash, expiresAt: session.idleExpiresAt } } },
      select: { id: true },
    });
  });

  it('revokes only the oldest excess sessions before inserting a new one', async () => {
    const { repository, db } = authFixture();
    db.authSession.findMany.mockResolvedValueOnce(Array.from({ length: 11 }, (_, i) => ({ id: 'old-' + i })));

    await repository.startFederatedSession({ session, refreshHash });

    expect(db.authSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: user.id, revokedAt: null, idleExpiresAt: { gt: now }, absoluteExpiresAt: { gt: now } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }));
    expect(db.authSession.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-0', 'old-1'] } },
      data: { revokedAt: now, revocationReason: 'SESSION_LIMIT' },
    });
    expect(db.authSession.updateMany.mock.invocationCallOrder[0]).toBeLessThan(db.authSession.create.mock.invocationCallOrder[0]!);
  });

  it('rejects disabled or unverified federated accounts', async () => {
    const { repository, db } = authFixture();
    db.user.findUnique.mockResolvedValueOnce({ ...user, disabledAt: now });

    await expect(repository.startFederatedSession({ session, refreshHash })).rejects.toThrow('INVALID_CREDENTIALS');

    db.user.findUnique.mockResolvedValueOnce({ ...user, emailVerifiedAt: null });
    await expect(repository.startFederatedSession({ session, refreshHash })).rejects.toThrow('EMAIL_NOT_VERIFIED');

    expect(db.authSession.create).not.toHaveBeenCalled();
  });

  it('authenticates only active sessions belonging to the claimed user', async () => {
    const { repository, db } = authFixture();

    expect((await repository.authenticate(identity, now)).id).toBe(user.id);
    await expect(repository.authenticate({ ...identity, userId: 'other' }, now)).rejects.toThrow('INVALID_SESSION');
    await expect(repository.authenticate(identity, session.idleExpiresAt)).rejects.toThrow('INVALID_SESSION');

    db.authSession.findUnique.mockResolvedValueOnce({ ...session, revokedAt: now, user });
    await expect(repository.authenticate(identity, now)).rejects.toThrow('INVALID_SESSION');
  });

  it('rotates refresh tokens and caps their expiry at the absolute session limit', async () => {
    const { repository, db } = authFixture();
    const refreshedAt = new Date(now.getTime() + 300000);

    db.refreshToken.findUnique
      .mockResolvedValueOnce({ sessionId: session.id })
      .mockResolvedValueOnce({ id: 'refresh', sessionId: session.id, expiresAt: session.idleExpiresAt, usedAt: null });

    expect(await repository.rotate({ tokenHash: refreshHash, nextHash: 'next-hash', now: refreshedAt, idleSeconds: 7200 }))
      .toEqual({ identity, expiresAt: session.absoluteExpiresAt });
    expect(db.refreshToken.update).toHaveBeenCalledWith({ where: { id: 'refresh' }, data: { usedAt: refreshedAt } });
    expect(db.authSession.update).toHaveBeenCalledWith({
      where: { id: session.id },
      data: { idleExpiresAt: session.absoluteExpiresAt, lastRefreshedAt: refreshedAt },
    });
    expect(db.refreshToken.create).toHaveBeenCalledWith({
      data: { sessionId: session.id, tokenHash: 'next-hash', expiresAt: session.absoluteExpiresAt },
    });
  });

  it('persists revocation after token reuse without issuing another token', async () => {
    const { repository, db } = authFixture();
    db.refreshToken.findUnique
      .mockResolvedValueOnce({ sessionId: session.id })
      .mockResolvedValueOnce({ id: 'refresh', sessionId: session.id, expiresAt: session.idleExpiresAt, usedAt: now });

    await expect(repository.rotate({ tokenHash: refreshHash, nextHash: 'next', now, idleSeconds: 600 })).rejects.toThrow('TOKEN_REUSED');
    expect(db.authSession.update).toHaveBeenCalledWith({
      where: { id: session.id }, data: { revokedAt: now, revocationReason: 'REFRESH_REUSE' },
    });
    expect(db.refreshToken.create).not.toHaveBeenCalled();
  });

  it('scopes session revocation and active-session listings to the authenticated owner', async () => {
    const { repository, db } = authFixture();
    db.authSession.findFirst.mockResolvedValueOnce(null);

    await repository.revoke({ identity: { ...identity, userId: 'other' }, now, reason: 'SESSION_REVOKED' });
    expect(db.authSession.update).not.toHaveBeenCalled();

    await repository.revoke({ identity, now, reason: 'SESSION_REVOKED' });
    expect(db.authSession.findFirst).toHaveBeenLastCalledWith({ where: { id: session.id, userId: user.id } });
    expect(db.authSession.update).toHaveBeenCalledWith({
      where: { id: session.id }, data: { revokedAt: now, revocationReason: 'SESSION_REVOKED' },
    });

    await repository.revokeAll(user.id, now);
    expect(db.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null }, data: { revokedAt: now, revocationReason: 'LOGOUT_ALL' },
    });

    await repository.listSessions(user.id, now);
    expect(db.authSession.findMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null, idleExpiresAt: { gt: now }, absoluteExpiresAt: { gt: now } },
      select: { id: true, createdAt: true, lastRefreshedAt: true, absoluteExpiresAt: true, userAgent: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
  });
});
