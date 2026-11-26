import { describe, expect, it } from 'vitest';

import {
  decideMercadoPagoCredentialAccess,
  isMercadoPagoRefreshCoolingDown,
  MERCADO_PAGO_REAUTHORIZE_COOLDOWN_MS,
  MERCADO_PAGO_REFRESH_MARGIN_MS,
} from './mercadoPagoRefresh.policy.js';

const now = new Date('2026-11-25T15:00:00Z');
const context = { ownerId: 'owner-a', clientId: '1234', liveMode: false };
const row = {
  connectedById: context.ownerId,
  clientId: context.clientId,
  liveMode: context.liveMode,
  disconnectedAt: null,
  expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
  accessTokenCiphertext: 'encrypted-access',
  refreshTokenCiphertext: 'encrypted-refresh',
  refreshClaimId: null,
  refreshStartedAt: null,
};

describe('Mercado Pago credential renewal policy', () => {
  it('reuses a current seller token', () => {
    expect(decideMercadoPagoCredentialAccess(row, context, false, now)).toBe('REUSE');
  });

  it('rotates at the safety margin and after expiry', () => {
    for (const expiresAt of [new Date(now.getTime() + MERCADO_PAGO_REFRESH_MARGIN_MS), new Date(now.getTime() - 1)]) {
      expect(decideMercadoPagoCredentialAccess({ ...row, expiresAt }, context, false, now)).toBe('ROTATE');
    }
  });

  it.each([
    { connectedById: 'other' },
    { clientId: '999' },
    { liveMode: true },
    { disconnectedAt: now },
    { expiresAt: null },
    { accessTokenCiphertext: null },
    { refreshTokenCiphertext: null },
    { refreshClaimId: 'already-claimed', refreshStartedAt: now },
    { refreshClaimId: 'uncertain', refreshStartedAt: new Date(0) },
  ])('does not reuse or rotate unsafe credentials: %j', (patch) => {
    expect(decideMercadoPagoCredentialAccess({ ...row, ...patch }, context, false, now)).toBe('RECONNECT_REQUIRED');
  });

  it('blocks issuance during OAuth and when no account is connected', () => {
    expect(decideMercadoPagoCredentialAccess(row, context, true, now)).toBe('RECONNECT_REQUIRED');
    expect(decideMercadoPagoCredentialAccess(null, context, false, now)).toBe('RECONNECT_REQUIRED');
  });

  it('allows explicit reauthorization after the cooldown but not automatic refresh retry', () => {
    const past = new Date(now.getTime() - MERCADO_PAGO_REAUTHORIZE_COOLDOWN_MS);

    expect(isMercadoPagoRefreshCoolingDown(now, now)).toBe(true);
    expect(isMercadoPagoRefreshCoolingDown(past, now)).toBe(false);
    expect(isMercadoPagoRefreshCoolingDown(null, now)).toBe(false);
    expect(decideMercadoPagoCredentialAccess({
      ...row,
      refreshClaimId: 'uncertain',
      refreshStartedAt: past
    }, context, false, now)).toBe('RECONNECT_REQUIRED');
  });
});
