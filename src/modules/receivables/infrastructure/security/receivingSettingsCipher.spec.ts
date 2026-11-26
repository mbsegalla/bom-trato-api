import { describe, expect, it } from 'vitest';

import { ReceivingSettingsCipher } from './receivingSettingsCipher.js';

describe('receiving settings cipher', () => {
  const cipher = new ReceivingSettingsCipher('a'.repeat(64));

  it('uses randomized authenticated encryption and binds the destination to its organization and type', () => {
    const encrypted = cipher.encrypt('organization-a', 'EMAIL', 'pix@example.com');

    expect(encrypted).not.toContain('pix@example.com');
    expect(cipher.encrypt('organization-a', 'EMAIL', 'pix@example.com')).not.toBe(encrypted);
    expect(cipher.decrypt('organization-a', 'EMAIL', encrypted)).toBe('pix@example.com');
    expect(() => cipher.decrypt('organization-b', 'EMAIL', encrypted)).toThrow('RECEIVING_SETTINGS_UNAVAILABLE');
    expect(() => cipher.decrypt('organization-a', 'EVP', encrypted)).toThrow('RECEIVING_SETTINGS_UNAVAILABLE');
    expect(() => new ReceivingSettingsCipher('b'.repeat(64)).decrypt('organization-a', 'EMAIL', encrypted)).toThrow('RECEIVING_SETTINGS_UNAVAILABLE');
  });

  it('fails closed when encryption is unavailable or the payload is malformed', () => {
    const unavailable = new ReceivingSettingsCipher(undefined);

    expect(unavailable.available).toBe(false);
    expect(() => unavailable.encrypt('organization', 'EMAIL', 'pix@example.com')).toThrow('RECEIVING_SETTINGS_UNAVAILABLE');
    expect(() => cipher.decrypt('organization', 'EMAIL', 'invalid')).toThrow('RECEIVING_SETTINGS_UNAVAILABLE');
    expect(() => new ReceivingSettingsCipher('invalid')).toThrow('RECEIVING_SETTINGS_UNAVAILABLE');
  });
});
