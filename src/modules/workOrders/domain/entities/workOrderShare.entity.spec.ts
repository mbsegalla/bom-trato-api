import { describe, expect, it } from 'vitest';

import { WorkOrderShare } from './workOrderShare.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
const expiresAt = new Date(now.getTime() + 30 * 86400000);
const input = {
  id: 'share',
  organizationId: 'org',
  workOrderId: 'order',
  tokenHash: 'hash',
  userId: 'owner',
  expiresAt,
};

describe('WorkOrderShare', () => {
  it('binds a link to its exact tenant and order, and excludes future, expired or revoked links', () => {
    const share = WorkOrderShare.create(input, now);

    expect(share.isReadableAt(now)).toBe(true);
    expect(share.isReadableAt(new Date(now.getTime() - 1))).toBe(false);
    expect(share.isReadableAt(expiresAt)).toBe(false);
    expect(() => share.assertReadable('other', 'order', now)).toThrow('WORK_ORDER_SHARE_NOT_FOUND');
    expect(() => share.assertReadable('org', 'other', now)).toThrow('WORK_ORDER_SHARE_NOT_FOUND');
    expect(WorkOrderShare.restore({ ...share.snapshot(), revokedAt: now }).isReadableAt(now)).toBe(false);
  });

  it.each([now, new Date(expiresAt.getTime() + 1), new Date(NaN)])('rejects invalid expiration %s', (date) => {
    expect(() => WorkOrderShare.create({ ...input, expiresAt: date }, now)).toThrow(
      'INVALID_WORK_ORDER_SHARE_EXPIRATION',
    );
  });
});
