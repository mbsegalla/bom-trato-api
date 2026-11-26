import type { LivePixViewStatus } from '../../application/types/mercadoPagoLivePix.types.js';

import { sandboxPixBalance, SANDBOX_PIX_PROCESSING_MS } from './mercadoPagoSandboxPix.policy.js';

export const LIVE_PIX_RECOVERY_LEASE_MS = 120_000;
export const LIVE_PIX_RECOVERY_COOLDOWN_MS = 60_000;

interface ReceivableSnapshot {
  version: number;
  status: string;
  currency: string;
  amountInCents: number;
  receivedInCents: number;
}

interface IssuanceSnapshot {
  status: 'RESERVED' | 'PENDING' | 'REVIEW_REQUIRED' | 'SETTLED' | 'CLOSED';
  receivableVersion: number;
  amountInCents: number;
  createdAt: Date;
  expiresAt: Date | null;
  settlementReviewCode: string | null;
}

interface RecoveryAttempt {
  resultCode: string;
  leaseExpiresAt: Date;
  completedAt: Date | null;
  startedAt: Date;
}

export function livePixViewStatus(
  issuance: IssuanceSnapshot | null,
  receivable: ReceivableSnapshot,
  canPresent: boolean,
  now: Date,
): LivePixViewStatus {
  if (issuance === null) return 'NOT_ISSUED';
  if (issuance.settlementReviewCode !== null || issuance.status === 'REVIEW_REQUIRED') return 'REVIEW_REQUIRED';
  if (issuance.status === 'SETTLED' || issuance.status === 'CLOSED') return issuance.status;
  if (issuance.status === 'RESERVED') {
    return now.getTime() - issuance.createdAt.getTime() < SANDBOX_PIX_PROCESSING_MS
      ? 'PROCESSING' : 'REVIEW_REQUIRED';
  }

  if (issuance.expiresAt === null || issuance.expiresAt <= now) return 'EXPIRED';
  if (!canPresent || issuance.receivableVersion !== receivable.version || issuance.amountInCents !== sandboxPixBalance(receivable)) {
    return 'STALE';
  }

  return 'PENDING';
}

export function nextLivePixRecoveryAt(issuance: IssuanceSnapshot, latest: RecoveryAttempt | null): Date {
  const ready = issuance.status === 'RESERVED'
    ? issuance.createdAt.getTime() + SANDBOX_PIX_PROCESSING_MS : issuance.createdAt.getTime();
  const cooldown = latest === null ? 0 : latest.resultCode === 'IN_PROGRESS'
    ? latest.leaseExpiresAt.getTime()
    : (latest.completedAt ?? latest.startedAt).getTime() + LIVE_PIX_RECOVERY_COOLDOWN_MS;
  return new Date(Math.max(ready, cooldown));
}
