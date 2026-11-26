import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

import { PrismaAutomationEventRepository } from './prismaAutomationEvent.repository.js';

const organizationId = 'organization';
const now = new Date('2026-01-01T00:00:00Z');
const row = {
  id: 'event',
  automationType: 'QUOTE_FOLLOW_UP',
  automationEntityType: 'QUOTE',
  automationEntityId: 'quote',
  automationDescription: 'Fixture reminder',
  automationHref: '/quotes/quote',
  status: 'FAILED',
  availableAt: now,
  createdAt: now,
  finishedAt: now,
  lastErrorCode: 'FIXTURE_FAILURE',
};

function fixture() {
  const findUnique = vi.fn().mockResolvedValue(null);
  const findMany = vi.fn<(args: { select: Record<string, unknown> }) => Promise<unknown[]>>().mockResolvedValue([]);
  const repository = new PrismaAutomationEventRepository({
    organizationMember: { findUnique },
    notificationOutbox: { findMany },
  } as unknown as PrismaService);

  return { repository, findUnique, findMany };
}

describe('PrismaAutomationEventRepository', () => {
  it('checks the exact organization and user membership', async () => {
    const f = fixture();
    f.findUnique.mockResolvedValueOnce({ id: 'member' });

    expect(await f.repository.isMember('user', organizationId)).toBe(true);
    expect(await f.repository.isMember('other', organizationId)).toBe(false);

    expect(f.findUnique).toHaveBeenNthCalledWith(1, {
      where: { organizationId_userId: { organizationId, userId: 'user' } },
      select: { id: true },
    });
  });

  it('returns delivery metadata without exposing encrypted payload or recipient', async () => {
    const f = fixture();
    f.findMany.mockResolvedValueOnce([{ ...row, encryptedPayload: 'private', recipient: 'private' }]);

    expect(await f.repository.list(organizationId, 5)).toEqual([
      {
        id: row.id,
        type: row.automationType,
        entityType: row.automationEntityType,
        entityId: row.automationEntityId,
        description: row.automationDescription,
        href: row.automationHref,
        status: row.status,
        availableAt: now,
        createdAt: now,
        finishedAt: now,
        lastErrorCode: row.lastErrorCode,
      },
    ]);
    expect(f.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId,
          automationType: { not: null },
          automationEntityType: { not: null },
          automationEntityId: { not: null },
          automationDescription: { not: null },
          automationHref: { not: null },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
    );
    const selection = f.findMany.mock.calls[0][0].select;

    expect(selection).not.toHaveProperty('encryptedPayload');
    expect(selection).not.toHaveProperty('recipient');
  });

  it.each(['automationType', 'automationEntityType', 'automationEntityId', 'automationDescription', 'automationHref'])(
    'discards incomplete automation metadata: %s',
    async (field) => {
      const f = fixture();
      f.findMany.mockResolvedValueOnce([{ ...row, [field]: null }]);

      expect(await f.repository.list(organizationId, 10)).toEqual([]);
    },
  );
});
