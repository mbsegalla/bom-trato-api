import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe } from 'vitest';

import { PrismaService } from '../../../src/infrastructure/database/prisma.service.js';

const url = process.env.PAYMENT_INTEGRATION_DATABASE_URL;

export function databaseSuite(name: string, run: () => void): void {
  if (url === undefined) {
    describe.skip(name, run);

    return;
  }

  describe(name, run);
}

export function createDisposableDatabaseFixture() {
  let prisma: PrismaService;
  const cleanups: (() => Promise<unknown>)[] = [];

  beforeAll(async () => {
    if (!url) throw new Error('Missing disposable integration database URL');
    const parsed = new URL(url);
    if (parsed.protocol !== 'postgresql:' || !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
      parsed.pathname !== '/bom_trato_ci' || parsed.username !== 'bom_trato_ci' ||
      parsed.searchParams.get('schema') !== 'public') {
      throw new Error('Tests require disposable local bom_trato_ci database');
    }
    prisma = new PrismaService({ url });

    await prisma.$connect();
  });

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  function cleanup(operation: () => Promise<unknown>): void {
    cleanups.push(operation);
  }

  async function user() {
    const row = await prisma.user.create({ data: {
      name: 'Fixture user',
      email: randomUUID() + '@example.invalid',
      passwordHash: 'fixture-hash',
      emailVerifiedAt: new Date(),
    } });
    cleanup(() => prisma.user.deleteMany({ where: { id: row.id } }));

    return row;
  }

  async function tenant() {
    const owner = await user();
    const now = new Date();

    const org = await prisma.organization.create({ data: {
      name: 'Fixture organization',
      ownerId: owner.id,
      setupCompletedAt: now
    } });
    cleanup(() => prisma.organization.deleteMany({ where: { id: org.id } }));

    await prisma.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, role: 'OWNER' } });
    cleanup(() => prisma.organizationMember.deleteMany({ where: { organizationId: org.id } }));

    await prisma.organizationTrial.create({ data: {
      organizationId: org.id,
      ownerId: owner.id,
      startsAt: new Date(now.getTime() - 60000),
      expiresAt: new Date(now.getTime() + 86400000),
    } });
    cleanup(() => prisma.organizationTrial.deleteMany({ where: { organizationId: org.id } }));

    return { organizationId: org.id, userId: owner.id };
  }

  return {
    get prisma() {
      return prisma;
    },
    cleanup,
    user,
    tenant
  };
}
