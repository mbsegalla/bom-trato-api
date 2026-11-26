import { vi } from 'vitest';

import type { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { AuthSession } from '../../../domain/entities/authSession.entity.js';
import { PrismaAuthRepository } from '../prismaAuth.repository.js';

export const now = new Date('2026-01-01T12:00:00Z');
export const user = {
  id: 'user',
  name: 'Fixture user',
  email: 'fixture@example.invalid',
  passwordHash: 'fixture-password-hash',
  selectedPlanPriceId: null,
  emailVerifiedAt: now,
  disabledAt: null,
};
export const session = AuthSession.start('session', user.id, now, 600, 3600, 'Fixture browser').snapshot();
export const identity = { userId: user.id, sessionId: session.id };
export const google = {
  id: 'identity',
  userId: user.id,
  provider: 'GOOGLE' as const,
  providerAccountId: 'fixture-subject',
};

export function authFixture() {
  const db = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      create: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(undefined),
    },
    planPrice: { findFirst: vi.fn().mockResolvedValue({ id: 'price' }) },
    authIdentity: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(undefined),
    },
    authSession: {
      findUnique: vi.fn().mockResolvedValue({ ...session, user }),
      findFirst: vi.fn().mockResolvedValue(session),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    refreshToken: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
    authActionToken: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue(undefined),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  const transaction = vi.fn(async (operation: (tx: typeof db) => Promise<unknown>) => operation(db));
  const repository = new PrismaAuthRepository({ ...db, $transaction: transaction } as unknown as PrismaService);

  return { repository, db, transaction };
}
