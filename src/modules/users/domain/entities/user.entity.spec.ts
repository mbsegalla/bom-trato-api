import { describe, expect, it } from 'vitest';

import { User } from './user.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
const input = {
  id: 'user',
  name: 'Fixture',
  email: 'fixture@example.invalid',
  passwordHash: 'hash',
  selectedPlanPriceId: null,
  emailVerifiedAt: null,
  disabledAt: null,
};

describe('User', () => {
  it.each(['A!short', 'lowercase!1234', 'Uppercase1234', 'A!' + 'x'.repeat(127)])(
    'rejects invalid password requirements',
    (password) => {
      expect(() => User.assertPassword(password)).toThrow('INVALID_PASSWORD');
    },
  );

  it('accepts Unicode uppercase and symbols with code-point length boundaries', () => {
    expect(() => User.assertPassword('Á' + '😀'.repeat(11))).not.toThrow();
    expect(() => User.assertPassword('A!' + 'x'.repeat(126))).not.toThrow();
  });

  it('keeps the first verification timestamp and returns no password hash in public data', () => {
    const user = User.restore(input);
    user.verifyEmail(now);
    user.verifyEmail(new Date(now.getTime() + 1000));
    user.changePassword('new-hash');

    expect(user.emailVerifiedAt).toEqual(now);
    expect(user.passwordHash).toBe('new-hash');
    expect(user.toPublic()).toEqual({
      id: 'user',
      name: 'Fixture',
      email: input.email,
      selectedPlanPriceId: null,
      emailVerified: true,
    });

    const copy = user.emailVerifiedAt!;
    copy.setTime(0);

    expect(user.emailVerifiedAt).toEqual(now);
  });

  it('prevents disabled accounts from using verification or password actions', () => {
    const user = User.restore({ ...input, disabledAt: now });

    expect(() => user.verifyEmail(now)).toThrow('INVALID_TOKEN');
    expect(() => user.changePassword('new')).toThrow('INVALID_TOKEN');
    expect(() => User.restore(input).changePassword('')).toThrow('INVALID_TOKEN');
  });
});
