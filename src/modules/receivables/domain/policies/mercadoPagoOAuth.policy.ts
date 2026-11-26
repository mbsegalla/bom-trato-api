import { createHash } from 'node:crypto';

import { ReceivingSettingsError } from '../errors/receivingSettings.error.js';

export const MERCADO_PAGO_STATE_TTL_MS = 10 * 60 * 1000;

interface Attempt {
  organizationId: string;
  ownerId: string;
  sessionId: string;
  clientId: string;
  liveMode: boolean;
  expiresAt: Date;
  consumedAt: Date | null;
  verifierCiphertext: string | null;
}

interface OAuthContext {
  organizationId: string;
  ownerId: string;
  sessionId: string;
  clientId: string;
  liveMode: boolean;
}

export function hashMercadoPagoState(state: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) {
    throw new ReceivingSettingsError('MERCADO_PAGO_OAUTH_INVALID');
  }

  return createHash('sha256').update(state).digest('hex');
}

export function isMercadoPagoAttemptCurrent(
  attempt: Attempt,
  context: OAuthContext,
  now: Date,
  consumed: boolean,
): boolean {
  return (
    attempt.organizationId === context.organizationId &&
    attempt.ownerId === context.ownerId &&
    attempt.sessionId === context.sessionId &&
    attempt.clientId === context.clientId &&
    attempt.liveMode === context.liveMode &&
    attempt.expiresAt.getTime() > now.getTime() &&
    (consumed
      ? attempt.consumedAt !== null && attempt.verifierCiphertext === null
      : attempt.consumedAt === null && attempt.verifierCiphertext !== null)
  );
}
