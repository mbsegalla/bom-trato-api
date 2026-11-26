import { describe, expect, it } from 'vitest';

import { AuthSession } from './authSession.entity.js';

const start = new Date('2026-01-01T00:00:00Z');
const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);
const session = () => AuthSession.start('session', 'user', start, 60, 120, 'a'.repeat(350));

describe('AuthSession', () => {
  it('enforces idle expiry at the exact boundary', () => {
    const value = session();
    expect(() => value.assertActive(at(59))).not.toThrow();
    expect(() => value.assertActive(at(60))).toThrow('INVALID_SESSION');
  });

  it('renews idle lifetime without extending absolute expiry', () => {
    const value = session();
    value.renew(at(50), 60);
    value.renew(at(100), 60);
    expect(value.snapshot()).toMatchObject({ idleExpiresAt: at(120), absoluteExpiresAt: at(120), lastRefreshedAt: at(100) });
    expect(() => value.renew(at(120), 60)).toThrow('INVALID_SESSION');
  });

  it('retains the first revocation reason and rejects subsequent activity', () => {
    const value = session();
    value.revoke(at(10), 'LOGOUT');
    value.revoke(at(20), 'LOGOUT_ALL');
    expect(value.snapshot()).toMatchObject({ revokedAt: at(10), revocationReason: 'LOGOUT' });
    expect(() => value.assertActive(at(11))).toThrow('INVALID_SESSION');
  });

  it('limits user agent data and returns detached snapshots', () => {
    const value = session();
    const snapshot = value.snapshot();
    expect(snapshot.userAgent).toHaveLength(300);
    snapshot.idleExpiresAt.setTime(0);
    expect(value.snapshot().idleExpiresAt).toEqual(at(60));
  });

  it.each([[0, 120], [-1, 120], [120, 60]])('rejects invalid expiry policy (%i, %i)', (idle, absolute) => {
    expect(() => AuthSession.start('s', 'u', start, idle, absolute, null)).toThrow();
  });
});
