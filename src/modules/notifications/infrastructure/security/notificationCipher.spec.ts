import { describe, expect, it } from 'vitest';

import { NotificationCipher } from './notificationCipher.js';

const config = { encryptionKey: 'a'.repeat(64) } as ConstructorParameters<typeof NotificationCipher>[0];
const cipher = new NotificationCipher(config);
const message = {
  from: 'fixture@example.invalid',
  to: 'recipient@example.invalid',
  template: {
    id: 'template',
    variables: {
      token: 'fixture-private-token',
      amount: 100
    }
  }
};

describe('NotificationCipher', () => {
  it('encrypts with distinct IVs and authenticates the exact notification identity', () => {
    const first = cipher.encrypt('id', message);
    const second = cipher.encrypt('id', message);

    expect(first).not.toBe(second);
    expect(first).not.toContain(message.template.variables.token);
    expect(cipher.decrypt('id', first)).toEqual(message);
    expect(() => cipher.decrypt('other', first)).toThrow();
    expect(() => new NotificationCipher({ ...config, encryptionKey: 'b'.repeat(64) }).decrypt('id', first)).toThrow();
  });

  it('rejects tampered ciphertext, malformed envelope and invalid template variables', () => {
    const parts = cipher.encrypt('id', message).split('.');
    parts[1] = (parts[1]!.startsWith('a') ? 'b' : 'a') + parts[1]!.slice(1);

    expect(() => cipher.decrypt('id', parts.join('.'))).toThrow();
    expect(() => cipher.decrypt('id', 'invalid')).toThrow('INVALID_NOTIFICATION_PAYLOAD');

    const invalidVariables: Record<string, string | number>[] = [
      { 'bad key': 'value' },
      { token: 'x'.repeat(2001) },
      { amount: Number.MAX_SAFE_INTEGER + 1 }
    ];
    for (const variables of invalidVariables) {
      const payload = cipher.encrypt('id', { ...message, template: { id: 'template', variables } });

      expect(() => cipher.decrypt('id', payload)).toThrow('INVALID_NOTIFICATION_PAYLOAD');
    }
  });
});
