import { describe, expect, it, vi } from 'vitest';

import { automationFixture, now, trial } from './support/automationPolicy.fixture.js';
import { canEnqueueAutomation } from './prismaAutomationEnqueue.policy.js';

describe('automation enqueue eligibility', () => {
  it('locks the organization and counts its automation jobs within the trial window', async () => {
    const { db, tx } = automationFixture();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      db.notificationOutbox.count.mockResolvedValueOnce(49);
      expect(await canEnqueueAutomation(tx, trial.organizationId)).toBe(true);
      db.notificationOutbox.count.mockResolvedValueOnce(50);
      expect(await canEnqueueAutomation(tx, trial.organizationId)).toBe(false);

      expect(db.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
      expect(db.$queryRaw.mock.calls[0][1]).toBe(trial.organizationId);
      expect(db.notificationOutbox.count).toHaveBeenCalledWith({
        where: {
          organizationId: trial.organizationId,
          automationType: { not: null },
          createdAt: { gte: trial.startsAt, lt: trial.expiresAt },
        },
      });
      expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        db.notificationOutbox.count.mock.invocationCallOrder[0],
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('denies missing organizations before evaluating platform access', async () => {
    const { db, tx } = automationFixture();
    db.$queryRaw.mockResolvedValueOnce([]);

    expect(await canEnqueueAutomation(tx, trial.organizationId)).toBe(false);
    expect(db.organization.findUnique).not.toHaveBeenCalled();
    expect(db.notificationOutbox.count).not.toHaveBeenCalled();
  });

  it('does not grant trial quota to a previously paid or revoked organization', async () => {
    const { db, tx } = automationFixture();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      db.billingInvoice.findFirst.mockResolvedValueOnce({ id: 'paid-invoice' });
      expect(await canEnqueueAutomation(tx, trial.organizationId)).toBe(false);

      db.organization.findUnique.mockResolvedValueOnce({ trial: { ...trial, revokedAt: now }, subscriptions: [] });
      expect(await canEnqueueAutomation(tx, trial.organizationId)).toBe(false);
      expect(db.notificationOutbox.count).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
