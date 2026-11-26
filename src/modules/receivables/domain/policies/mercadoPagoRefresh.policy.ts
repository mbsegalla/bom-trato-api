export const MERCADO_PAGO_REFRESH_MARGIN_MS = 5 * 60 * 1000;
export const MERCADO_PAGO_REAUTHORIZE_COOLDOWN_MS = 2 * 60 * 1000;

interface ConnectionState {
  connectedById: string;
  clientId: string;
  liveMode: boolean;
  disconnectedAt: Date | null;
  expiresAt: Date | null;
  accessTokenCiphertext: string | null;
  refreshTokenCiphertext: string | null;
  refreshClaimId: string | null;
  refreshStartedAt: Date | null;
}

interface ConnectionContext {
  ownerId: string;
  clientId: string;
  liveMode: boolean;
}

export function isMercadoPagoRefreshCoolingDown(startedAt: Date | null, now: Date): boolean {
  return startedAt !== null && now.getTime() - startedAt.getTime() < MERCADO_PAGO_REAUTHORIZE_COOLDOWN_MS;
}

export function decideMercadoPagoCredentialAccess(
  row: ConnectionState | null,
  context: ConnectionContext,
  oauthInProgress: boolean,
  now: Date,
): 'REUSE' | 'ROTATE' | 'RECONNECT_REQUIRED' {
  if (
    row === null ||
    row.connectedById !== context.ownerId ||
    row.clientId !== context.clientId ||
    row.liveMode !== context.liveMode ||
    row.disconnectedAt !== null ||
    row.refreshClaimId !== null ||
    row.refreshStartedAt !== null ||
    row.accessTokenCiphertext === null ||
    row.refreshTokenCiphertext === null ||
    row.expiresAt === null ||
    oauthInProgress
  ) {
    return 'RECONNECT_REQUIRED';
  }

  return row.expiresAt.getTime() > now.getTime() + MERCADO_PAGO_REFRESH_MARGIN_MS ? 'REUSE' : 'ROTATE';
}
