import { describe, expect, it } from 'vitest';

import { createHash } from 'node:crypto';
import { NodeWorkOrderShareSecurity } from './nodeWorkOrderShareSecurity.js';

describe('NodeWorkOrderShareSecurity', () => {
  it('issues independent opaque 256-bit secrets with a verifiable one-way digest', () => {
    const security = new NodeWorkOrderShareSecurity();
    const first = security.issue();
    const second = security.issue();

    expect(first.token).toMatch(/^[a-f0-9]{64}$/);
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toBe(createHash('sha256').update(first.token).digest('hex'));
    expect(first.hash).not.toBe(first.token);
    expect(security.hash(first.token)).toBe(first.hash);
  });

  it.each([
    '',
    'a'.repeat(63),
    'a'.repeat(65),
    'G'.repeat(64),
    'A'.repeat(64),
    ' ' + 'a'.repeat(64)
  ])('rejects malformed private link secrets', (value) => {
    expect(() => new NodeWorkOrderShareSecurity().hash(value)).toThrow('WORK_ORDER_SHARE_NOT_FOUND');
  });
});
