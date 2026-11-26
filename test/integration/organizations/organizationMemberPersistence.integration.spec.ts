import { expect, it } from 'vitest';

import { PrismaOrganizationMemberRepository } from '../../../src/modules/organizations/infrastructure/repositories/prismaOrganizationMember.repository.js';
import { PrismaOrganizationTrialRepository } from '../../../src/modules/organizations/infrastructure/repositories/prismaOrganizationTrial.repository.js';
import { createDisposableDatabaseFixture, databaseSuite } from '../support/disposableDatabase.fixture.js';

databaseSuite('organization membership persistence (disposable PostgreSQL)', () => {
  const db = createDisposableDatabaseFixture();

  it('adds and removes a member only within the specified organization', async () => {
    const first = await db.tenant();
    const other = await db.tenant();
    const member = await db.user();
    const repository = new PrismaOrganizationMemberRepository(db.prisma);

    db.cleanup(() => db.prisma.organizationMember.deleteMany({ where: { userId: member.id } }));

    await repository.add({ organizationId: first.organizationId, userId: member.id });

    const entry = await repository.findByUser({ organizationId: first.organizationId, userId: member.id });

    expect(entry).toMatchObject({ userId: member.id, role: 'MEMBER' });
    expect(await repository.findByUser({ organizationId: other.organizationId, userId: member.id })).toBeNull();
    expect(await repository.existsByEmail({ organizationId: first.organizationId, email: member.email })).toBe(true);
    expect(await repository.existsByEmail({ organizationId: other.organizationId, email: member.email })).toBe(false);
    expect(await repository.count(first.organizationId)).toBe(2);

    const memberId = entry!.id;

    expect(await repository.findById({ organizationId: other.organizationId, memberId })).toBeNull();
    await expect(repository.remove({ organizationId: other.organizationId, memberId })).rejects.toThrow();

    expect(await repository.count(first.organizationId)).toBe(2);

    await repository.remove({ organizationId: first.organizationId, memberId });

    expect(await repository.count(first.organizationId)).toBe(1);
  });

  it('paginates members and maps joined organizations without returning unrelated organizations', async () => {
    const first = await db.tenant();
    const other = await db.tenant();
    const member = await db.user();
    const repository = new PrismaOrganizationMemberRepository(db.prisma);

    db.cleanup(() => db.prisma.organizationMember.deleteMany({ where: { userId: member.id } }));

    await repository.add({ organizationId: first.organizationId, userId: member.id });

    const page1 = await repository.list({ organizationId: first.organizationId, page: 1, limit: 1 });
    const page2 = await repository.list({ organizationId: first.organizationId, page: 2, limit: 1 });
    const joined = await repository.listJoined({ userId: member.id, page: 1, limit: 10 });

    expect(page1).toMatchObject({ page: 1, hasMore: true });
    expect(page2).toMatchObject({ page: 2, hasMore: false });
    expect([...page1.items, ...page2.items].map((item) => item.userId).sort()).toEqual(
      [first.userId, member.id].sort(),
    );
    expect(joined.items.map((item) => item.id)).toEqual([first.organizationId]);
    expect(joined.items[0]?.role).toBe('MEMBER');
    expect(joined.items.some((item) => item.id === other.organizationId)).toBe(false);
  });

  it('resolves trial ownership consistently and never returns a trial for an unrelated user', async () => {
    const actor = await db.tenant();
    const user = await db.user();
    const repository = new PrismaOrganizationTrialRepository(db.prisma);

    const trial = await repository.findByOrganizationId(actor.organizationId);

    expect(trial).toMatchObject({
      organizationId: actor.organizationId,
      ownerId: actor.userId,
      convertedAt: null,
      revokedAt: null,
    });
    expect(await repository.findByOwnerId(actor.userId)).toEqual(trial);
    expect(await repository.findByOwnerId(user.id)).toBeNull();
  });
});
