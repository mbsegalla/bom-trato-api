import { describe, expect, it } from 'vitest';

import { hashMercadoPagoState, isMercadoPagoAttemptCurrent, MERCADO_PAGO_STATE_TTL_MS } from './mercadoPagoOAuth.policy.js';

const now = new Date('2026-11-25T15:00:00Z');
const context = {
  organizationId: 'organization-a',
  ownerId: 'owner-a',
  sessionId: 'session-a',
  clientId: '123456',
  liveMode: false,
};
const attempt = {
  ...context,
  expiresAt: new Date(now.getTime() + MERCADO_PAGO_STATE_TTL_MS),
  consumedAt: null,
  verifierCiphertext: 'ciphertext',
};

describe('Mercado Pago OAuth attempt policy', () => {
  it('hashes only a correctly formed random state', () => {
    const state = 'a'.repeat(43);
    expect(hashMercadoPagoState(state)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashMercadoPagoState(state)).not.toContain(state);
    expect(hashMercadoPagoState('b'.repeat(43))).not.toBe(hashMercadoPagoState(state));
    expect(() => hashMercadoPagoState('short')).toThrow('MERCADO_PAGO_OAUTH_INVALID');
  });

  it('permits initial consumption and finalization in distinct states', () => {
    expect(isMercadoPagoAttemptCurrent(attempt, context, now, false)).toBe(true);
    expect(isMercadoPagoAttemptCurrent(attempt, context, now, true)).toBe(false);

    const consumed = { ...attempt, consumedAt: now, verifierCiphertext: null };

    expect(isMercadoPagoAttemptCurrent(consumed, context, now, false)).toBe(false);
    expect(isMercadoPagoAttemptCurrent(consumed, context, now, true)).toBe(true);
  });

  it.each([
    { organizationId: 'organization-b' },
    { ownerId: 'owner-b' },
    { sessionId: 'session-b' },
    { clientId: '654321' },
    { liveMode: true },
  ])('rejects a changed binding: %j', (patch) => {
    expect(isMercadoPagoAttemptCurrent(attempt, { ...context, ...patch }, now, false)).toBe(false);
  });

  it('rejects expired attempts, even if already consumed', () => {
    expect(isMercadoPagoAttemptCurrent(attempt, context, attempt.expiresAt, false)).toBe(false);
    expect(
      isMercadoPagoAttemptCurrent(
        { ...attempt, consumedAt: now, verifierCiphertext: null },
        context,
        attempt.expiresAt,
        true,
      ),
    ).toBe(false);
  });
});
