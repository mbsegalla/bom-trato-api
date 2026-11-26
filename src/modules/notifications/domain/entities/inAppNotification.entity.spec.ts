import { describe, expect, it } from 'vitest';

import type { CreateInAppNotificationParams } from './inAppNotification.entity.js';
import { InAppNotification } from './inAppNotification.entity.js';

const now = new Date('2026-01-01T00:00:00Z');
const input: CreateInAppNotificationParams = {
  id: 'notification',
  key: 'event',
  userId: 'user',
  organizationId: 'org',
  type: 'LEAD_RECEIVED',
  title: ' New lead ',
  message: ' Message ',
  href: '/leads',
  createdAt: now,
};

describe('InAppNotification', () => {
  it.each(['https://example.invalid', '//example.invalid', '', 'relative/path'])(
    'rejects nonlocal or invalid notification href %s',
    (href) => {
      expect(() => InAppNotification.create({ ...input, href })).toThrow('INVALID_NOTIFICATION');
    },
  );

  it('normalizes content and preserves the first read timestamp', () => {
    const notification = InAppNotification.create(input);
    notification.markRead(now);
    notification.markRead(new Date(now.getTime() + 1000));

    expect(notification.snapshot()).toMatchObject({ title: 'New lead', message: 'Message', readAt: now });
  });
});
