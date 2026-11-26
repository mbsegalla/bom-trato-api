import { describe, expect, it } from 'vitest';

import { OrganizationTrial } from './organizationTrial.entity.js';

const start = new Date('2026-01-01T00:00:00Z');
const day = 86_400_000;
const at = (days: number) => new Date(start.getTime() + days * day);
const trial = () => OrganizationTrial.create({
  id: 'trial',
  organizationId: 'org',
  ownerId: 'owner',
  now: start
});

describe('OrganizationTrial', () => {
  it('grants 14 days and denies access at the exact expiry boundary', () => {
    const value = trial();

    expect(value.snapshot().expiresAt).toEqual(at(14));
    expect(value.hasAccessAt(at(-1))).toBe(false);
    expect(value.remainingDaysAt(at(13.5))).toBe(1);
    expect(value.hasAccessAt(at(14))).toBe(false);
    expect(value.remainingDaysAt(at(14))).toBe(0);
  });

  it('does not restore access after conversion or revocation', () => {
    const converted = trial();
    converted.convert(at(1));
    converted.convert(at(2));

    expect(converted.snapshot().convertedAt).toEqual(at(1));
    expect(converted.hasAccessAt(at(2))).toBe(false);

    const revoked = trial();
    revoked.revoke(at(1));

    expect(revoked.hasAccessAt(at(2))).toBe(false);
  });

  it('rejects invalid transition dates and detached trial access', () => {
    const value = trial();

    expect(() => value.convert(at(-1))).toThrow('INVALID_TRIAL_CONVERSION_DATE');
    expect(() => value.revoke(at(-1))).toThrow('INVALID_TRIAL_REVOCATION_DATE');
    expect(OrganizationTrial.restore({ ...value.snapshot(), organizationId: null }).hasAccessAt(start)).toBe(false);
  });
});
