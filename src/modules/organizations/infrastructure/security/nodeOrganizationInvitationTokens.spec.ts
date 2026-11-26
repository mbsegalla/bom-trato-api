import { describe, expect, it } from 'vitest';

import { createHash } from 'node:crypto';
import { NodeOrganizationInvitationTokens } from './nodeOrganizationInvitationTokens.js';

describe('NodeOrganizationInvitationTokens', () => {
  it('generates unique URL-safe credentials and a deterministic SHA-256 digest', () => {
    const tokens = new NodeOrganizationInvitationTokens();
    const first = tokens.create();
    const second = tokens.create();
    expect(first.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.value).not.toBe(second.value);
    expect(first.hash).toBe(createHash('sha256').update(first.value).digest('hex'));
    expect(tokens.hash(first.value)).toBe(first.hash);
    expect(first.hash).not.toBe(second.hash);
  });
});
