import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { NotificationOutbox } from '../../application/ports/notificationOutbox.port.js';
import { OperationalReminderWorker } from './operationalReminder.worker.js';

const now = new Date('2026-01-01T12:00:00Z');
const tomorrow = new Date(now.getTime() + 3600000);
const yesterday = new Date(now.getTime() - 3600000);
const organization = {
  name: 'Fixture organization',
  ownerId: 'owner',
  autoWorkOrderReminderEnabled: true,
  autoReceivableReminderEnabled: true,
};
const order = {
  id: 'order',
  organizationId: 'org',
  assignedToId: 'worker',
  customerName: 'Fixture customer',
  customerEmail: 'customer@example.invalid',
  title: 'Fixture service',
  scheduledStartAt: tomorrow,
  organization,
};
const receivable = {
  id: 'receivable',
  organizationId: 'org',
  customerName: 'Fixture customer',
  title: 'Fixture receivable',
  amountInCents: 10000,
  receivedInCents: 3000,
  dueAt: tomorrow,
  customer: { email: 'customer@example.invalid' },
  organization,
};

function fixture() {
  const quotes = vi.fn().mockResolvedValue([]);
  const orders = vi.fn().mockResolvedValue([]);
  const receivables = vi.fn().mockResolvedValue([]);
  const createMany = vi.fn().mockResolvedValue({ count: 1 });
  const executeRaw = vi.fn().mockResolvedValue(1);
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const worker = new OperationalReminderWorker(
    {
      quote: { findMany: quotes },
      workOrder: { findMany: orders },
      receivable: { findMany: receivables },
      inAppNotification: { createMany },
      $executeRaw: executeRaw,
    } as unknown as PrismaService,
    { enqueue } as unknown as NotificationOutbox,
  );

  return { worker, quotes, orders, receivables, createMany, executeRaw, enqueue };
}

async function run(worker: OperationalReminderWorker) {
  vi.useFakeTimers();
  vi.setSystemTime(now);

  try {
    await worker.run();
  } finally {
    vi.useRealTimers();
  }
}

describe('OperationalReminderWorker', () => {
  it('scans only actionable statuses and the configured reminder windows', async () => {
    const f = fixture();

    await run(f.worker);

    expect(f.quotes).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'SENT', sentAt: { lte: new Date(now.getTime() - 48 * 3600000) } }),
      take: 500,
    }));
    expect(f.orders).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: 'SCHEDULED',
        assignedToId: { not: null },
        scheduledStartAt: { gt: now, lte: new Date(now.getTime() + 24 * 3600000) },
      },
    }));
    expect(f.receivables).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: {
        status: { in: ['OPEN', 'PARTIALLY_PAID'] },
        dueAt: { gt: now, lte: new Date(now.getTime() + 24 * 3600000) },
      },
    }));
    expect(f.receivables).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: {
        status: { in: ['OPEN', 'PARTIALLY_PAID'] },
        dueAt: { lt: now },
      },
    }));
    expect(f.enqueue).not.toHaveBeenCalled();
  });

  it('notifies the quote owner and assigned professional and enqueues opted-in customer email', async () => {
    const f = fixture();
    f.quotes.mockResolvedValueOnce([{
      id: 'quote', organizationId: 'org', customerName: 'Fixture customer', title: 'Fixture quote', organization,
    }]);
    f.orders.mockResolvedValueOnce([order]);

    await run(f.worker);

    expect(f.createMany).toHaveBeenNthCalledWith(1, {
      data: [expect.objectContaining({
        key: 'quote-follow-up/quote', organizationId: 'org', userId: 'owner', type: 'QUOTE_FOLLOW_UP', href: '/quotes/quote',
      })],
      skipDuplicates: true,
    });
    expect(f.createMany).toHaveBeenNthCalledWith(2, {
      data: [expect.objectContaining({
        key: 'work-order-reminder/order/' + tomorrow.toISOString(),
        organizationId: 'org', userId: 'worker', type: 'WORK_ORDER_REMINDER',
      })],
      skipDuplicates: true,
    });
    expect(f.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      key: 'automation/work-order-reminder/order/' + tomorrow.toISOString(),
      recipient: order.customerEmail,
      expiresAt: tomorrow,
      content: expect.objectContaining({ type: 'WORK_ORDER_REMINDER', scheduledStartAt: tomorrow.toISOString() }),
    }));
  });

  it('does not send email when disabled or when the customer has no address', async () => {
    const f = fixture();
    f.orders.mockResolvedValueOnce([
      { ...order, organization: { ...organization, autoWorkOrderReminderEnabled: false } },
      { ...order, id: 'no-email', customerEmail: null },
      { ...order, id: 'unassigned', assignedToId: null },
    ]);
    f.receivables.mockResolvedValueOnce([{ ...receivable, customer: { email: null } }])
      .mockResolvedValueOnce([{ ...receivable, organization: { ...organization, autoReceivableReminderEnabled: false } }]);

    await run(f.worker);

    expect(f.createMany).toHaveBeenCalledTimes(4);
    expect(f.enqueue).not.toHaveBeenCalled();
  });

  it('uses the outstanding balance in cents and stable due-date keys for customer reminders', async () => {
    const f = fixture();
    f.receivables.mockResolvedValueOnce([receivable])
      .mockResolvedValueOnce([{ ...receivable, id: 'overdue', dueAt: yesterday }]);

    await run(f.worker);

    expect(f.enqueue).toHaveBeenNthCalledWith(1, expect.objectContaining({
      key: 'automation/receivable-due-soon/receivable/' + tomorrow.toISOString(),
      expiresAt: tomorrow,
      content: expect.objectContaining({ type: 'RECEIVABLE_DUE_SOON', amountDueInCents: 7000 }),
    }));
    expect(f.enqueue).toHaveBeenNthCalledWith(2, expect.objectContaining({
      key: 'automation/receivable-overdue/overdue/' + yesterday.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 3600000),
      content: expect.objectContaining({ type: 'RECEIVABLE_OVERDUE', amountDueInCents: 7000 }),
    }));
  });

  it('does not emit duplicate realtime notifications when persistence reports a duplicate key', async () => {
    const f = fixture();
    f.orders.mockResolvedValueOnce([order]);
    f.createMany.mockResolvedValueOnce({ count: 0 });

    await run(f.worker);

    expect(f.executeRaw).not.toHaveBeenCalled();
    expect(f.enqueue).toHaveBeenCalledTimes(1);
  });

  it('contains a failed scan and can recover during the next scheduled execution', async () => {
    const f = fixture();
    f.quotes.mockRejectedValueOnce(new Error('fixture database error'));

    await run(f.worker);
    await run(f.worker);

    expect(f.quotes).toHaveBeenCalledTimes(2);
    expect(f.orders).toHaveBeenCalledTimes(1);
  });
});
