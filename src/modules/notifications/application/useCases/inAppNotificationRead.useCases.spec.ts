import { describe, expect, it, vi } from 'vitest';

import type { InAppNotificationRepository } from '../../domain/repositories/inAppNotification.repository.js';
import { ListInAppNotificationsUseCase } from './listInAppNotifications.useCase.js';
import { MarkAllInAppNotificationsReadUseCase } from './markAllInAppNotificationsRead.useCase.js';
import { MarkInAppNotificationReadUseCase } from './markInAppNotificationRead.useCase.js';

const actor = { userId: 'user', organizationId: 'org' };
function fixture() {
  const repository = {
    isMember: vi.fn<InAppNotificationRepository['isMember']>().mockResolvedValue(true),
    list: vi.fn<InAppNotificationRepository['list']>().mockResolvedValue({ items: [], unreadCount: 0 }),
    markRead: vi.fn<InAppNotificationRepository['markRead']>().mockResolvedValue(true),
    markAllRead: vi.fn<InAppNotificationRepository['markAllRead']>().mockResolvedValue(undefined),
  };
  const port = repository as unknown as InAppNotificationRepository;
  return { repository, list: new ListInAppNotificationsUseCase(port), one: new MarkInAppNotificationReadUseCase(port), all: new MarkAllInAppNotificationsReadUseCase(port) };
}
describe('in-app notification read use cases', () => {
  it('denies list and mutation to nonmembers without reading notification data', async () => {
    const f = fixture();
    f.repository.isMember.mockResolvedValue(false);
    await expect(f.list.execute({ ...actor, limit: 10 })).rejects.toThrow('MEMBER_REQUIRED');
    await expect(f.one.execute({ ...actor, id: 'id' })).rejects.toThrow('MEMBER_REQUIRED');
    await expect(f.all.execute(actor)).rejects.toThrow('MEMBER_REQUIRED');
    expect(f.repository.list).not.toHaveBeenCalled();
    expect(f.repository.markRead).not.toHaveBeenCalled();
    expect(f.repository.markAllRead).not.toHaveBeenCalled();
  });
  it('scopes the list and both read mutations to the current user and organization', async () => {
    const f = fixture();
    expect(await f.list.execute({ ...actor, limit: 10 })).toEqual({ items: [], unreadCount: 0 });
    expect(f.repository.list).toHaveBeenCalledWith({ ...actor, limit: 10 });
    await f.one.execute({ ...actor, id: 'id' });
    expect(f.repository.markRead).toHaveBeenCalledWith({ ...actor, id: 'id', now: expect.any(Date) });
    await f.all.execute(actor);
    expect(f.repository.markAllRead).toHaveBeenCalledWith({ ...actor, now: expect.any(Date) });
  });
  it('returns not found for a notification outside the scoped repository', async () => {
    const f = fixture();
    f.repository.markRead.mockResolvedValueOnce(false);
    await expect(f.one.execute({ ...actor, id: 'other' })).rejects.toThrow('NOTIFICATION_NOT_FOUND');
  });
});
