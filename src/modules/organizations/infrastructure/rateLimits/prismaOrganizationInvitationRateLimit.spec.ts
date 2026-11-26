import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaOrganizationInvitationRateLimit } from './prismaOrganizationInvitationRateLimit.js';

const now = new Date('2026-01-01T12:00:00Z');
const params = { organizationId: 'org', now };
const expiresAt = new Date(now.getTime() + 3600000);

function fixture(row: { count: number; expiresAt: Date } | null) {
  const findUnique = vi.fn().mockResolvedValue(row);
  const upsert = vi.fn().mockResolvedValue(undefined);
  const repository = new PrismaOrganizationInvitationRateLimit({
    organizationInvitationRateLimit: { findUnique, upsert },
  } as unknown as Prisma.TransactionClient);
  return { repository, findUnique, upsert };
}

describe('PrismaOrganizationInvitationRateLimit', () => {
  it.each([null, { count: 30, expiresAt: now }, { count: 30, expiresAt: new Date(now.getTime() - 1) }])(
    'starts a fresh window when no active limit exists',
    async (row) => {
      const f = fixture(row);
      await f.repository.consume(params);
      expect(f.findUnique).toHaveBeenCalledWith({ where: { organizationId: 'org' } });
      expect(f.upsert).toHaveBeenCalledWith({
        where: { organizationId: 'org' },
        create: { organizationId: 'org', count: 1, expiresAt },
        update: { count: 1, expiresAt },
      });
    },
  );

  it('increments an active window without extending its expiry', async () => {
    const until = new Date(now.getTime() + 1000);
    const f = fixture({ count: 29, expiresAt: until });
    await f.repository.consume(params);
    expect(f.upsert).toHaveBeenCalledWith({
      where: { organizationId: 'org' },
      create: { organizationId: 'org', count: 30, expiresAt: until },
      update: { count: 30, expiresAt: until },
    });
  });

  it('rejects attempts at the limit without modifying the row', async () => {
    const f = fixture({ count: 30, expiresAt });
    await expect(f.repository.consume(params)).rejects.toThrow('INVITATION_RATE_LIMITED');
    expect(f.upsert).not.toHaveBeenCalled();
  });
});
