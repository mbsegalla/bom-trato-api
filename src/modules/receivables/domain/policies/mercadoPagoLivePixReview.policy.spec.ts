import { describe, expect, it } from 'vitest';

import { livePixViewStatus, nextLivePixRecoveryAt } from './mercadoPagoLivePixReview.policy.js';

const now = new Date('2026-11-25T12:00:00Z');
const receivable = {
  version: 1,
  status: 'OPEN',
  currency: 'brl',
  amountInCents: 10_000,
  receivedInCents: 0
};
const row = {
  status: 'PENDING' as const,
  receivableVersion: 1,
  amountInCents: 10_000,
  createdAt: now,
  expiresAt: new Date(now.getTime() + 3600_000),
  settlementReviewCode: null,
};

describe('live Pix presentation and recovery admission', () => {
  it('exposes only a current, unexpired pending charge with valid release and connection', () => {
    expect(livePixViewStatus(row, receivable, true, now)).toBe('PENDING');
    expect(livePixViewStatus(row, receivable, false, now)).toBe('STALE');
    expect(livePixViewStatus(row, { ...receivable, version: 2 }, true, now)).toBe('STALE');
    expect(livePixViewStatus(row, receivable, true, row.expiresAt)).toBe('EXPIRED');
    expect(livePixViewStatus({
      ...row,
      settlementReviewCode: 'VERIFIED_REFUNDED'
    }, receivable, true, now)).toBe('REVIEW_REQUIRED');
  });

  it('preserves terminal outcomes without displaying any payment code', () => {
    expect(livePixViewStatus({ ...row, status: 'SETTLED' }, receivable, false, now)).toBe('SETTLED');
    expect(livePixViewStatus({ ...row, status: 'CLOSED' }, receivable, false, now)).toBe('CLOSED');
  });

  it('enforces a recovery lease and cooldown, including reservations still being created', () => {
    const leaseExpiresAt = new Date(now.getTime() + 120_000);

    expect(nextLivePixRecoveryAt({ ...row, status: 'RESERVED' }, null)).toEqual(leaseExpiresAt);
    expect(nextLivePixRecoveryAt(row, {
      resultCode: 'IN_PROGRESS',
      startedAt: now,
      completedAt: null,
      leaseExpiresAt,
    })).toEqual(leaseExpiresAt);
    expect(nextLivePixRecoveryAt(row, {
      resultCode: 'NOT_FOUND',
      startedAt: now,
      completedAt: now,
      leaseExpiresAt,
    })).toEqual(new Date(now.getTime() + 60_000));
  });
});
