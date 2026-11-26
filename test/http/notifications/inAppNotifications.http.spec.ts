import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ListInAppNotificationsUseCase } from '../../../src/modules/notifications/application/useCases/listInAppNotifications.useCase.js';
import { ListAutomationEventsUseCase } from '../../../src/modules/notifications/application/useCases/listAutomationEvents.useCase.js';
import { MarkInAppNotificationReadUseCase } from '../../../src/modules/notifications/application/useCases/markInAppNotificationRead.useCase.js';
import { MarkAllInAppNotificationsReadUseCase } from '../../../src/modules/notifications/application/useCases/markAllInAppNotificationsRead.useCase.js';
import { NotificationStreamTicketService } from '../../../src/modules/notifications/infrastructure/realtime/notificationStreamTicket.service.js';
import { NotificationRealtimeService } from '../../../src/modules/notifications/infrastructure/realtime/notificationRealtime.service.js';
import { InAppNotificationsController } from '../../../src/modules/notifications/presentation/http/controllers/inAppNotifications.controller.js';

import { createHttpFixture, organizationId, itemId, userId } from '../support/http.fixture.js';

const route = '/api/organizations/' + organizationId + '/notifications';
const actor = { organizationId, userId };

describe('inAppNotifications HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof createHttpFixture>>;
  const list = vi.fn();
  const events = vi.fn();
  const read = vi.fn();
  const readAll = vi.fn();
  const issue = vi.fn();
  const consume = vi.fn();
  const stream = vi.fn();

  beforeAll(async () => {
    fixture = await createHttpFixture([InAppNotificationsController], [
      { provide: ListInAppNotificationsUseCase, useValue: { execute: list } },
      { provide: ListAutomationEventsUseCase, useValue: { execute: events } },
      { provide: MarkInAppNotificationReadUseCase, useValue: { execute: read } },
      { provide: MarkAllInAppNotificationsReadUseCase, useValue: { execute: readAll } },
      { provide: NotificationStreamTicketService, useValue: { issue: issue, consume: consume } },
      { provide: NotificationRealtimeService, useValue: { stream: stream } },

    ]);
  });

  beforeEach(() => {
    list.mockReset().mockResolvedValue({ items: [], unreadCount: 0 });
    events.mockReset().mockResolvedValue({ items: [] });
    read.mockReset().mockResolvedValue(undefined);
    readAll.mockReset().mockResolvedValue(undefined);
    issue.mockReset();
    consume.mockReset();
    stream.mockReset();
  });

  afterAll(async () => {
    await fixture?.app.close();
  });

  it('rejects unauthenticated reads and out-of-range notification limits', async () => {
    await request(fixture.server).get(route).expect(401);

    for (const query of ['limit=0', 'limit=51', 'limit=1.5', 'userId=' + itemId]) {
      await request(fixture.server).get(route + '?' + query).set('Authorization', 'Bearer fixture').expect(400);
    }

    expect(list).not.toHaveBeenCalled();
  });

  it('scopes notification and automation event queries to the authenticated member', async () => {
    await request(fixture.server).get(route + '?limit=12').set('Authorization', 'Bearer fixture').expect(200);
    await request(fixture.server).get(route + '/automation-events?limit=7').set('Authorization', 'Bearer fixture').expect(200);

    expect(list).toHaveBeenCalledWith({ ...actor, limit: 12 });
    expect(events).toHaveBeenCalledWith({ ...actor, limit: 7 });
  });

  it('requires a valid notification identifier and scopes read acknowledgements', async () => {
    await request(fixture.server).post(route + '/invalid/read').set('Authorization', 'Bearer fixture').expect(400);

    expect(read).not.toHaveBeenCalled();

    await request(fixture.server).post(route + '/' + itemId + '/read').set('Authorization', 'Bearer fixture').expect(204);
    await request(fixture.server).post(route + '/read-all').set('Authorization', 'Bearer fixture').expect(204);

    expect(read).toHaveBeenCalledWith({ ...actor, id: itemId });
    expect(readAll).toHaveBeenCalledWith(actor);
  });
});
