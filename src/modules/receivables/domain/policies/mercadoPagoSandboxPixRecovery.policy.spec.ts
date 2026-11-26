import { describe, expect, it } from 'vitest';

import {
  isSandboxVerifiedStatus,
  sandboxRecoveryNextAt,
  sandboxRecoveryViewStatus,
} from './mercadoPagoSandboxPixRecovery.policy.js';

const createdAt = new Date('2026-11-25T15:00:00Z');
const issuance = { status: 'PENDING' as const, createdAt };
const attempt = {
  status: 'IN_PROGRESS' as const,
  startedAt: createdAt,
  leaseExpiresAt: new Date(createdAt.getTime() + 120_000),
  completedAt: null,
};

describe('sandbox recovery admission and audit status', () => {
  it('does not compete with a fresh original issuance', () => {
    expect(sandboxRecoveryNextAt(issuance, null)).toEqual(createdAt);
    expect(sandboxRecoveryNextAt({ ...issuance, status: 'RESERVED' }, null)).toEqual(attempt.leaseExpiresAt);
  });

  it('blocks overlapping claims until the lease expires', () => {
    expect(sandboxRecoveryNextAt(issuance, attempt)).toEqual(attempt.leaseExpiresAt);
    expect(sandboxRecoveryViewStatus(attempt, createdAt)).toBe('IN_PROGRESS');
    expect(sandboxRecoveryViewStatus(attempt, attempt.leaseExpiresAt)).toBe('ABANDONED');
  });

  it('requires a cooldown even for an empty or failed search', () => {
    const completedAt = new Date(createdAt.getTime() + 20_000);

    expect(sandboxRecoveryNextAt(issuance, { ...attempt, status: 'NOT_FOUND', completedAt })).toEqual(
      new Date(completedAt.getTime() + 60_000),
    );
  });

  it('only recognizes verified provider evidence', () => {
    expect(isSandboxVerifiedStatus('VERIFIED_APPROVED')).toBe(true);
    expect(isSandboxVerifiedStatus('VERIFIED_REFUNDED')).toBe(true);
    expect(isSandboxVerifiedStatus('UNMATCHED_PAYMENT')).toBe(false);
    expect(isSandboxVerifiedStatus(null)).toBe(false);
  });
});
