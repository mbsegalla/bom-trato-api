import { describe, expect, it } from 'vitest';

import { automationFixture, day, job, now, trial, trialRow } from './support/automationPolicy.fixture.js';
import { readTrialLifecycleNotification, shouldSkipTrialLifecycle } from './prismaTrialLifecycle.policy.js';

describe('trial lifecycle notification eligibility', () => {
  it('builds the first-quote notice only for the verified owner of the current trial', async () => {
    const { db, tx } = automationFixture();

    expect(await readTrialLifecycleNotification(tx, trial.id, now)).toEqual({
      key: 'trial-lifecycle/' + trial.id + '/FIRST_QUOTE',
      recipient: trialRow.owner.email,
      availableAt: now,
      expiresAt: new Date(now.getTime() + day),
      content: {
        type: 'TRIAL_LIFECYCLE',
        stage: 'FIRST_QUOTE',
        organizationId: trial.organizationId,
        trialExpiresAt: trial.expiresAt.toISOString(),
      },
    });
    expect(db.organizationMember.findUnique).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: trial.organizationId, userId: trial.ownerId } },
      select: { role: true },
    });
    expect(db.quote.findFirst).toHaveBeenCalledWith({
      where: { organizationId: trial.organizationId },
      select: { id: true },
    });
  });

  it.each([
    null,
    { ...trialRow, convertedAt: now },
    { ...trialRow, organization: null },
    { ...trialRow, organization: { ...trialRow.organization, ownerId: 'other' } },
    { ...trialRow, owner: { ...trialRow.owner, emailVerifiedAt: null } },
    { ...trialRow, owner: { ...trialRow.owner, disabledAt: now } },
  ])('suppresses ineligible trial or recipient records: %j', async (row) => {
    const { db, tx } = automationFixture();
    db.organizationTrial.findUnique.mockResolvedValueOnce(row);

    expect(await readTrialLifecycleNotification(tx, trial.id, now)).toBeNull();
    expect(db.organizationMember.findUnique).not.toHaveBeenCalled();
  });

  it('skips recipients who lost ownership, paid for access or already created a quote', async () => {
    const { db, tx } = automationFixture();
    db.organizationMember.findUnique.mockResolvedValueOnce({ role: 'MEMBER' });
    expect(await readTrialLifecycleNotification(tx, trial.id, now)).toBeNull();

    db.subscription.findFirst.mockResolvedValueOnce({ id: 'previous-subscription' });
    expect(await readTrialLifecycleNotification(tx, trial.id, now)).toBeNull();

    db.quote.findFirst.mockResolvedValueOnce({ id: 'quote' });
    expect(await readTrialLifecycleNotification(tx, trial.id, now)).toBeNull();
  });

  it('allows expiry notices only during the day after trial access ends', async () => {
    const { tx } = automationFixture();
    const expired = await readTrialLifecycleNotification(tx, trial.id, trial.expiresAt);

    expect(expired).toMatchObject({
      key: 'trial-lifecycle/' + trial.id + '/EXPIRED',
      expiresAt: new Date(trial.expiresAt.getTime() + day),
      content: { stage: 'EXPIRED' },
    });
    expect(await readTrialLifecycleNotification(tx, trial.id, new Date(trial.expiresAt.getTime() + day))).toBeNull();
  });

  it('revalidates recipient, stage, tenant and expiration immediately before delivery', async () => {
    const { tx } = automationFixture();
    const notification = job({
      type: 'TRIAL_LIFECYCLE',
      key: 'trial-lifecycle/' + trial.id + '/FIRST_QUOTE',
      automationType: null,
      expiresAt: new Date(now.getTime() + day),
    });

    expect(await shouldSkipTrialLifecycle(tx, notification, trialRow.owner.email, now)).toBe(false);
    expect(await shouldSkipTrialLifecycle(tx, notification, 'other@example.invalid', now)).toBe(true);

    for (const changes of [
      { key: 'invalid' },
      { key: 'trial-lifecycle/' + trial.id + '/WELCOME' },
      { organizationId: 'other' },
      { expiresAt: now },
    ]) {
      expect(await shouldSkipTrialLifecycle(tx, { ...notification, ...changes }, trialRow.owner.email, now)).toBe(true);
    }

    expect(await shouldSkipTrialLifecycle(tx, job(), trialRow.owner.email, now)).toBe(false);
  });
});
