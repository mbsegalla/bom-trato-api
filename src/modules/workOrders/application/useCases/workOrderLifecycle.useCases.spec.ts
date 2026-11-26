import { describe, expect, it, vi } from 'vitest';

import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { Quote } from '../../../quotes/domain/entities/quote.entity.js';
import { QuoteItem } from '../../../quotes/domain/entities/quoteItem.entity.js';
import { Receivable } from '../../../receivables/domain/entities/receivable.entity.js';
import { ReceivablePayment } from '../../../receivables/domain/entities/receivablePayment.entity.js';
import type { ReceivableRepository } from '../../../receivables/domain/repositories/receivable.repository.js';
import { WorkOrder } from '../../domain/entities/workOrder.entity.js';
import type { WorkOrderRepository } from '../../domain/repositories/workOrder.repository.js';
import type { WorkOrderTransaction, WorkOrderUnitOfWork } from '../ports/workOrderUnitOfWork.port.js';
import type { WorkOrderReviewInvitationRepository } from '../ports/workOrderReviewInvitation.port.js';
import { WorkOrderApplicationService } from '../services/workOrderApplicationService.service.js';
import { AssignWorkOrderUseCase } from './assignWorkOrder.useCase.js';
import { CancelWorkOrderUseCase } from './cancelWorkOrder.useCase.js';
import { CompleteWorkOrderUseCase } from './completeWorkOrder.useCase.js';
import { ScheduleWorkOrderUseCase } from './scheduleWorkOrder.useCase.js';
import { StartWorkOrderUseCase } from './startWorkOrder.useCase.js';

const actor = { organizationId: 'org', userId: 'owner' };
const params = { ...actor, workOrderId: 'order', version: 1 };
const now = new Date('2026-01-01T00:00:00Z');
const access: OrganizationAccessContext = {
  isMember: true,
  verified: true,
  hasPlatformAccess: true,
  source: 'TRIAL',
  billingNeedsReconciliation: false
};
function fixture(started = false) {
  const quote = Quote.create({
    id: 'quote',
    ...actor,
    customer: {
      id: 'customer',
      name: 'Fixture customer',
      email: 'customer@example.invalid',
      phone: null
    },
    details: {
      title: 'Fixture service',
      paymentCondition: 'DOWN_PAYMENT_AND_BALANCE',
      downPaymentPercentage: 50
    },
  }, now);
  quote.addItem(QuoteItem.create('item', {
    name: 'Fixture service',
    unit: 'SERVICE',
    quantity: '1',
    unitAmountInCents: 10001
  }));
  quote.markSent(now);
  quote.approve(now);
  const order = WorkOrder.create({
    id: 'order',
    ...actor,
    quote: quote.snapshot(),
    itemIds: ['order-item']
  }, now);
  order.assign('worker');
  order.update({ serviceAddress: 'Rua de teste' });
  if (started) order.start(now);
  const workOrders = {
    findById: vi.fn<WorkOrderRepository['findById']>().mockResolvedValue(order.snapshot()),
    save: vi.fn<WorkOrderRepository['save']>().mockResolvedValue(undefined),
    hasScheduleConflict: vi.fn<WorkOrderRepository['hasScheduleConflict']>().mockResolvedValue(false),
  };
  const receivables = {
    findByWorkOrderIdAndKind: vi.fn<ReceivableRepository['findByWorkOrderIdAndKind']>().mockResolvedValue(null),
    create: vi.fn<ReceivableRepository['create']>().mockResolvedValue(undefined),
    listByWorkOrderId: vi.fn<ReceivableRepository['listByWorkOrderId']>().mockResolvedValue([]),
    save: vi.fn<ReceivableRepository['save']>().mockResolvedValue(undefined),
  };
  const findQuote = vi.fn<WorkOrderTransaction['findQuote']>().mockResolvedValue(quote.snapshot());
  const isAssignableMember = vi.fn<WorkOrderTransaction['isAssignableMember']>().mockResolvedValue(true);
  const findAutomationSettings = vi.fn<WorkOrderTransaction['findAutomationSettings']>().mockResolvedValue({ autoReviewRequestEnabled: true });
  const createInvitation = vi.fn<WorkOrderReviewInvitationRepository['create']>().mockResolvedValue({
    created: true,
    invitationId: 'invitation',
    recipientEmail: 'customer@example.invalid',
    organizationName: 'Fixture',
  });
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const notify = vi.fn().mockResolvedValue(undefined);
  const issue = vi.fn().mockReturnValue({ token: 'fixture-token', hash: 'fixture-hash' });
  const tx = {
    access,
    workOrders,
    receivables,
    findQuote,
    isAssignableMember,
    findAutomationSettings,
    findDefaultReceivableDueDays: vi.fn().mockResolvedValue(7),
    reviewInvitations: { create: createInvitation },
    notifications: { enqueue },
    inAppNotifications: { enqueue: notify },
  } as unknown as WorkOrderTransaction;
  const run = vi.fn(async (_actor: typeof actor, operation: (context: WorkOrderTransaction) => Promise<unknown>) => operation(tx));
  const service = new WorkOrderApplicationService({ run } as unknown as WorkOrderUnitOfWork);

  return {
    order,
    quote,
    workOrders,
    receivables,
    findQuote,
    isAssignableMember,
    findAutomationSettings,
    createInvitation,
    enqueue,
    notify,
    issue,
    service,
    complete: new CompleteWorkOrderUseCase(service, { issue, hash: () => 'fixture-hash' })
  };
}

describe('work order lifecycle use cases', () => {
  it('rejects an unavailable assignee before changing the work order', async () => {
    const f = fixture();
    f.isAssignableMember.mockResolvedValueOnce(false);

    await expect(new AssignWorkOrderUseCase(f.service).execute(params, 'outsider')).rejects.toThrow('ASSIGNEE_NOT_AVAILABLE');
    expect(f.workOrders.save).not.toHaveBeenCalled();
    expect(f.notify).not.toHaveBeenCalled();
  });

  it('notifies a newly assigned member but does not notify on repeated assignment', async () => {
    const f = fixture();
    const useCase = new AssignWorkOrderUseCase(f.service);

    expect(await useCase.execute(params, 'worker')).toMatchObject({ assignedToId: 'worker', version: 2 });
    expect(f.notify).not.toHaveBeenCalled();
    expect(await useCase.execute(params, 'other-worker')).toMatchObject({ assignedToId: 'other-worker', version: 2 });
    expect(f.notify).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'other-worker',
      organizationId: 'org',
      type: 'WORK_ORDER_ASSIGNED'
    }));
  });

  it('checks schedule collisions before saving the new version', async () => {
    const f = fixture();
    const input = {
      scheduledStartAt: new Date(Date.now() + 86400000).toISOString(),
      scheduledEndAt: new Date(Date.now() + 90000000).toISOString()
    };
    f.workOrders.hasScheduleConflict.mockResolvedValueOnce(true);

    await expect(new ScheduleWorkOrderUseCase(f.service).execute(params, input)).rejects.toThrow('WORK_ORDER_SCHEDULE_CONFLICT');
    expect(f.workOrders.save).not.toHaveBeenCalled();
    expect(await new ScheduleWorkOrderUseCase(f.service).execute(params, input)).toMatchObject({ status: 'SCHEDULED', version: 2 });
    expect(f.workOrders.save).toHaveBeenCalledWith(expect.any(WorkOrder), 1);
  });

  it('rechecks membership when starting a previously assigned work order', async () => {
    const f = fixture();
    f.isAssignableMember.mockResolvedValueOnce(false);

    await expect(new StartWorkOrderUseCase(f.service).execute(params)).rejects.toThrow('ASSIGNEE_NOT_AVAILABLE');
    expect(f.workOrders.save).not.toHaveBeenCalled();
    expect(await new StartWorkOrderUseCase(f.service).execute(params)).toMatchObject({ status: 'IN_PROGRESS', version: 2 });
  });

  it('creates the final receivable and queues a review for a completed service', async () => {
    const f = fixture(true);

    const result = await f.complete.execute(params);

    expect(result).toMatchObject({ status: 'COMPLETED', version: 2 });

    const payment = f.receivables.create.mock.calls[0]![0].snapshot();

    expect(payment).toMatchObject({
      workOrderId: 'order',
      kind: 'REMAINING_BALANCE',
      amountInCents: 5000
    });
    expect(payment.dueAt.getTime() - result.completedAt!.getTime()).toBe(7 * 86400000);
    expect(f.createInvitation).toHaveBeenCalledWith(expect.objectContaining({
      workOrderId: 'order',
      tokenHash: 'fixture-hash',
      organizationId: 'org'
    }));
    expect(f.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      key: 'automation/review-request/invitation',
      recipient: 'customer@example.invalid',
      content: expect.objectContaining({
        type: 'REVIEW_REQUEST',
        token: 'fixture-token'
      })
    }));
    expect(f.workOrders.save).toHaveBeenCalledTimes(1);
  });

  it('does not create review invitations when disabled, and never completes a draft order', async () => {
    const draft = fixture();

    await expect(draft.complete.execute(params)).rejects.toThrow('INVALID_WORK_ORDER_TRANSITION');
    expect(draft.receivables.create).not.toHaveBeenCalled();

    const f = fixture(true);
    f.findAutomationSettings.mockResolvedValueOnce({ autoReviewRequestEnabled: false });

    await f.complete.execute(params);

    expect(f.receivables.create).toHaveBeenCalledTimes(1);
    expect(f.issue).not.toHaveBeenCalled();
    expect(f.createInvitation).not.toHaveBeenCalled();
  });

  it('does not persist completion after missing quote or failed financial creation', async () => {
    const f = fixture(true);
    f.findQuote.mockResolvedValueOnce(null);

    await expect(f.complete.execute(params)).rejects.toThrow('QUOTE_NOT_FOUND');

    f.receivables.create.mockRejectedValueOnce(new Error('ledger write failed'));

    await expect(f.complete.execute(params)).rejects.toThrow('ledger write failed');
    expect(f.enqueue).not.toHaveBeenCalled();
    expect(f.workOrders.save).not.toHaveBeenCalled();
  });

  it('cancels only unpaid receivables and preserves those with recorded money', async () => {
    const f = fixture();
    const source = f.order.snapshot();
    const open = Receivable.create({
      id: 'open',
      ...actor,
      source,
      kind: 'DOWN_PAYMENT',
      amountInCents: 5001,
      dueAt: now
    }, now);
    const paid = Receivable.create({
      id: 'paid',
      ...actor,
      source,
      kind: 'REMAINING_BALANCE',
      amountInCents: 5000,
      dueAt: now
    }, now);
    paid.receive(ReceivablePayment.create(
      {
        id: 'payment',
        receivableId: 'paid',
        requestId: 'request',
        amountInCents: 100,
        method: 'PIX',
        receivedAt: now,
        recordedById: 'owner'
      },
      now
    ));
    f.receivables.listByWorkOrderId.mockResolvedValueOnce([open.snapshot(), paid.snapshot()]);

    expect(await new CancelWorkOrderUseCase(f.service).execute(params, 'Customer canceled')).toMatchObject({ status: 'CANCELED', version: 2 });
    expect(f.receivables.save).toHaveBeenCalledTimes(1);
    expect(f.receivables.save.mock.calls[0]![0].snapshot()).toMatchObject({
      id: 'open',
      status: 'CANCELED',
      version: 2
    });
    expect(paid.snapshot()).toMatchObject({ status: 'PARTIALLY_PAID', receivedInCents: 100 });
  });
});
