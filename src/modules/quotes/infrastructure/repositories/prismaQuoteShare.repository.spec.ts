import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { QuoteShare, type QuoteShareProps } from '../../domain/entities/quoteShare.entity.js';
import { PrismaQuoteShareRepository } from './prismaQuoteShare.repository.js';

const now = new Date('2026-01-01T12:00:00Z');
const state: QuoteShareProps = {
  id: 'share',
  organizationId: 'org',
  quoteId: 'quote',
  quoteVersion: 2,
  tokenHash: 'a'.repeat(64),
  createdById: 'owner',
  createdAt: now,
  expiresAt: new Date(now.getTime() + 3600000),
  revokedAt: null,
  decision: null,
  decidedAt: null,
  decidedVersion: null,
  changeRequestedAt: null,
  changeRequestMessage: null,
};

function fixture() {
  const findFirst = vi.fn().mockResolvedValue(null);
  const create = vi.fn().mockResolvedValue(undefined);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const repository = new PrismaQuoteShareRepository({
    quoteShare: { findFirst, create, updateMany },
  } as unknown as Prisma.TransactionClient, state.organizationId);

  return { repository, findFirst, create, updateMany };
}

describe('PrismaQuoteShareRepository', () => {
  it('reads only tenant-scoped hashes and maps the latest valid change request', async () => {
    const f = fixture();

    await f.repository.findByHash(state.tokenHash);
    expect(f.findFirst).toHaveBeenCalledWith({
      where: { tokenHash: state.tokenHash, organizationId: state.organizationId },
    });

    f.findFirst.mockResolvedValueOnce({ quoteVersion: 2, changeRequestedAt: now, changeRequestMessage: 'Fixture change' });

    expect(await f.repository.findLatestChangeRequest(state.quoteId)).toEqual({
      quoteVersion: 2,
      requestedAt: now,
      message: 'Fixture change',
    });
    expect(f.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: {
        quoteId: state.quoteId,
        organizationId: state.organizationId,
        changeRequestedAt: { not: null },
        changeRequestMessage: { not: null },
      },
      orderBy: [{ changeRequestedAt: 'desc' }, { id: 'desc' }],
    }));
  });

  it('returns no change request for missing or incomplete persistence results', async () => {
    const f = fixture();
    f.findFirst.mockResolvedValueOnce({ quoteVersion: 2, changeRequestedAt: null, changeRequestMessage: 'Fixture' });
    f.findFirst.mockResolvedValueOnce({ quoteVersion: 2, changeRequestedAt: now, changeRequestMessage: null });

    for (let index = 0; index < 3; index++) {
      expect(await f.repository.findLatestChangeRequest(state.quoteId)).toBeNull();
    }
  });

  it('rejects foreign creation, decision and change writes before accessing persistence', async () => {
    const f = fixture();
    const share = QuoteShare.restore({ ...state, organizationId: 'other' });

    await expect(f.repository.create(share)).rejects.toThrow('QUOTE_SHARE_NOT_FOUND');
    await expect(f.repository.saveDecision(share)).rejects.toThrow('QUOTE_SHARE_NOT_FOUND');
    await expect(f.repository.saveChangeRequest(share)).rejects.toThrow('QUOTE_SHARE_NOT_FOUND');

    expect(f.create).not.toHaveBeenCalled();
    expect(f.updateMany).not.toHaveBeenCalled();
  });

  it('persists the hash and scopes revocation to active links for the selected quote', async () => {
    const f = fixture();

    await f.repository.create(QuoteShare.restore(state));
    await f.repository.revokeForQuote(state.quoteId, now);

    expect(f.create).toHaveBeenCalledWith({ data: state });
    expect(f.updateMany).toHaveBeenCalledWith({
      where: { quoteId: state.quoteId, organizationId: state.organizationId, revokedAt: null },
      data: { revokedAt: now },
    });
  });

  it('uses mutually exclusive decision and change guards and reports concurrent conflicts', async () => {
    const f = fixture();
    const decision = QuoteShare.restore({ ...state, decision: 'APPROVED', decidedAt: now, decidedVersion: 3 });
    const change = QuoteShare.restore({ ...state, changeRequestedAt: now, changeRequestMessage: 'Fixture change' });
    const where = { id: state.id, organizationId: state.organizationId, revokedAt: null, decision: null, changeRequestedAt: null };

    await f.repository.saveDecision(decision);
    await f.repository.saveChangeRequest(change);

    expect(f.updateMany).toHaveBeenNthCalledWith(1, {
      where, data: { decision: 'APPROVED', decidedAt: now, decidedVersion: 3 },
    });
    expect(f.updateMany).toHaveBeenNthCalledWith(2, {
      where, data: { changeRequestedAt: now, changeRequestMessage: 'Fixture change' },
    });

    f.updateMany.mockResolvedValue({ count: 0 });
    await expect(f.repository.saveDecision(decision)).rejects.toThrow('QUOTE_SHARE_ALREADY_DECIDED');
    await expect(f.repository.saveChangeRequest(change)).rejects.toThrow('QUOTE_SHARE_CHANGE_ALREADY_REQUESTED');
  });
});
