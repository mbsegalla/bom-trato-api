import { describe, expect, it } from 'vitest';

import { OrganizationTrial } from '../../../organizations/domain/entities/organizationTrial.entity.js';

import { TrialLifecyclePolicy } from './trialLifecycle.policy.js';

const start = new Date('2026-01-01T00:00:00Z');
const at = (day: number) => new Date(start.getTime() + day * 86_400_000);
const trial = OrganizationTrial.create({
  id: 'trial',
  organizationId: 'org',
  ownerId: 'owner',
  now: start,
}).snapshot();

describe('TrialLifecyclePolicy', () => {
  it.each([
    [0, 'WELCOME'],
    [3, 'FIRST_QUOTE'],
    [7, 'GETTING_STARTED'],
    [11, 'EXPIRING_IN_THREE_DAYS'],
    [13, 'EXPIRING_TOMORROW'],
    [14, 'EXPIRED'],
  ] as const)('selects the correct notification window on day %i', (day, stage) => {
    expect(TrialLifecyclePolicy.resolve(trial, at(day))?.stage).toBe(stage);
  });

  it('does not send stale, future, revoked or converted trial notifications', () => {
    for (const day of [-1, 1, 4, 15]) {
      expect(TrialLifecyclePolicy.resolve(trial, at(day))).toBeNull();
    }

    expect(TrialLifecyclePolicy.resolve({ ...trial, convertedAt: start }, start)).toBeNull();
    expect(TrialLifecyclePolicy.resolve({ ...trial, revokedAt: start }, start)).toBeNull();
    expect(TrialLifecyclePolicy.key('trial', 'WELCOME')).toBe('trial-lifecycle/trial/WELCOME');
  });
});
