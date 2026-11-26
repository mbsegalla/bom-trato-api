import { createHash, randomUUID } from 'node:crypto';

import { expect, it } from 'vitest';

import { AuthSession } from '../../../src/modules/auth/domain/entities/authSession.entity.js';
import { PrismaAuthRepository } from '../../../src/modules/auth/infrastructure/repositories/prismaAuth.repository.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';

const hash = () => createHash('sha256').update(randomUUID()).digest('hex');

databaseSuite('auth session persistence (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  async function setup() {
    const user = await db.user();
    const now = new Date();
    const session = AuthSession.start(randomUUID(), user.id, now, 3600, 86400, null).snapshot();
    const tokenHash = hash();
    const repository = new PrismaAuthRepository(db.prisma);

    await repository.startSession({
      session,
      expectedPasswordHash: 'fixture-hash',
      refreshHash: tokenHash,
    });

    return {
      user,
      session,
      tokenHash,
      repository,
      now,
      identity: { userId: user.id, sessionId: session.id },
    };
  }

  it('persists one rotation and revokes the session on reuse of the old token', async () => {
    const f = await setup();
    const now = new Date(f.now.getTime() + 1000);
    const nextHash = hash();

    const rotated = await f.repository.rotate({
      tokenHash: f.tokenHash,
      nextHash,
      now,
      idleSeconds: 3600,
    });

    expect(rotated.identity).toEqual(f.identity);
    expect((await f.repository.authenticate(f.identity, now)).id).toBe(f.user.id);
    expect(await db.prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: f.tokenHash } })).toMatchObject({
      usedAt: now,
    });
    await expect(
      f.repository.rotate({
        tokenHash: f.tokenHash,
        nextHash: hash(),
        now,
        idleSeconds: 3600,
      }),
    ).rejects.toThrow('TOKEN_REUSED');
    expect(await db.prisma.authSession.findUniqueOrThrow({ where: { id: f.session.id } })).toMatchObject({
      revocationReason: 'REFRESH_REUSE',
    });
    await expect(f.repository.authenticate(f.identity, now)).rejects.toThrow('INVALID_SESSION');
    await expect(
      f.repository.rotate({
        tokenHash: nextHash,
        nextHash: hash(),
        now,
        idleSeconds: 3600,
      }),
    ).rejects.toThrow('INVALID_SESSION');
  });

  it('serializes concurrent token consumption without creating two replacement tokens', async () => {
    const f = await setup();
    const now = new Date(f.now.getTime() + 1000);

    const results = await Promise.allSettled(
      [hash(), hash()].map((nextHash) =>
        f.repository.rotate({
          tokenHash: f.tokenHash,
          nextHash,
          now,
          idleSeconds: 3600,
        }),
      ),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await db.prisma.refreshToken.count({ where: { sessionId: f.session.id } })).toBe(2);
    await expect(f.repository.authenticate(f.identity, now)).rejects.toThrow('INVALID_SESSION');
  }, 30000);

  it('rejects a session with the wrong user or stale password hash', async () => {
    const f = await setup();
    const other = await db.user();

    await expect(
      f.repository.authenticate(
        {
          userId: other.id,
          sessionId: f.session.id,
        },
        f.now,
      ),
    ).rejects.toThrow('INVALID_SESSION');

    const session = AuthSession.start(randomUUID(), f.user.id, f.now, 3600, 86400, null).snapshot();

    await expect(
      f.repository.startSession({
        session,
        expectedPasswordHash: 'stale-hash',
        refreshHash: hash(),
      }),
    ).rejects.toThrow('INVALID_CREDENTIALS');
    expect(await db.prisma.authSession.findUnique({ where: { id: session.id } })).toBeNull();
  });
});
