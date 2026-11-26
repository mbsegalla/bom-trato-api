import { describe, expect, it, vi } from 'vitest';

import type {
  AutomationEventProps,
  AutomationEventRepository,
} from '../../domain/repositories/automationEvent.repository.js';

import { ListAutomationEventsUseCase } from './listAutomationEvents.useCase.js';

const params = { organizationId: 'org', userId: 'user', limit: 5 };
const now = new Date('2026-01-01T00:00:00Z');
const event: AutomationEventProps = {
  id: 'event',
  type: 'QUOTE_FOLLOW_UP',
  entityType: 'QUOTE',
  entityId: 'quote',
  description: 'Fixture reminder',
  href: '/quotes/quote',
  status: 'ACCEPTED',
  availableAt: now,
  createdAt: now,
  finishedAt: now,
  lastErrorCode: null,
};

describe('ListAutomationEventsUseCase', () => {
  it('returns events only after membership has been verified', async () => {
    const isMember = vi.fn<AutomationEventRepository['isMember']>().mockResolvedValue(true);
    const list = vi.fn<AutomationEventRepository['list']>().mockResolvedValue([event]);
    const useCase = new ListAutomationEventsUseCase({ isMember, list });

    expect(await useCase.execute(params)).toEqual({ items: [event] });
    expect(isMember).toHaveBeenCalledWith(params.userId, params.organizationId);
    expect(list).toHaveBeenCalledWith(params.organizationId, params.limit);
    expect(isMember.mock.invocationCallOrder[0]).toBeLessThan(list.mock.invocationCallOrder[0]!);
  });

  it('does not list events for a nonmember', async () => {
    const isMember = vi.fn<AutomationEventRepository['isMember']>().mockResolvedValue(false);
    const list = vi.fn<AutomationEventRepository['list']>();
    const useCase = new ListAutomationEventsUseCase({ isMember, list });

    await expect(useCase.execute(params)).rejects.toThrow('MEMBER_REQUIRED');
    expect(list).not.toHaveBeenCalled();
  });
});
