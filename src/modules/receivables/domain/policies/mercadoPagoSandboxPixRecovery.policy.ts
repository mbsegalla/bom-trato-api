import type {
  SandboxPixRecoveryStatus,
  SandboxPixVerifiedStatus,
} from '../../application/types/mercadoPagoSandboxPixRecovery.types.js';

import { SANDBOX_PIX_PROCESSING_MS } from './mercadoPagoSandboxPix.policy.js';

export const SANDBOX_RECOVERY_LEASE_MS = 120_000;
export const SANDBOX_RECOVERY_COOLDOWN_MS = 60_000;

interface IssuanceState {
  status: 'RESERVED' | 'PENDING' | 'REVIEW_REQUIRED';
  createdAt: Date;
}

interface RecoveryState {
  status: SandboxPixRecoveryStatus;
  startedAt: Date;
  leaseExpiresAt: Date;
  completedAt: Date | null;
}

export function sandboxRecoveryNextAt(issuance: IssuanceState, latest: RecoveryState | null): Date {
  const issuanceReadyAt = issuance.status === 'RESERVED'
    ? issuance.createdAt.getTime() + SANDBOX_PIX_PROCESSING_MS
    : issuance.createdAt.getTime();
  const attemptReadyAt = latest === null
    ? 0
    : latest.status === 'IN_PROGRESS'
      ? latest.leaseExpiresAt.getTime()
      : (latest.completedAt ?? latest.startedAt).getTime() + SANDBOX_RECOVERY_COOLDOWN_MS;

  return new Date(Math.max(issuanceReadyAt, attemptReadyAt));
}

export function sandboxRecoveryViewStatus(attempt: RecoveryState, now: Date): SandboxPixRecoveryStatus {
  return attempt.status === 'IN_PROGRESS' && attempt.leaseExpiresAt <= now ? 'ABANDONED' : attempt.status;
}

export function isSandboxVerifiedStatus(status: string | null): status is SandboxPixVerifiedStatus {
  return status === 'VERIFIED_PENDING' ||
    status === 'VERIFIED_APPROVED' ||
    status === 'VERIFIED_CLOSED' ||
    status === 'VERIFIED_REFUNDED' ||
    status === 'VERIFIED_REVIEW_REQUIRED';
}
