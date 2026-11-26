import { describe, expect, it } from 'vitest';

import { shouldSkipAutomation } from './prismaAutomationDelivery.policy.js';
import { automationFixture, future, job, now, past, trial } from './support/automationPolicy.fixture.js';

describe('automation delivery eligibility', () => {
  it('bypasses ordinary notifications but rejects missing or inaccessible organizations', async () => {
    const { db, tx } = automationFixture();

    expect(await shouldSkipAutomation(tx, job({ automationType: null }), now)).toBe(false);
    expect(await shouldSkipAutomation(tx, job({ organizationId: null }), now)).toBe(true);
    expect(await shouldSkipAutomation(tx, job({ automationEntityId: null }), now)).toBe(true);
    expect(db.organization.findUnique).not.toHaveBeenCalled();

    db.organization.findUnique.mockResolvedValueOnce({ trial: { ...trial, revokedAt: now }, subscriptions: [] });
    expect(await shouldSkipAutomation(tx, job(), now)).toBe(true);
    expect(db.quoteShare.findFirst).not.toHaveBeenCalled();
  });

  it('delivers only unchanged sent quotes with current undecided shares', async () => {
    const { db, tx } = automationFixture();

    expect(await shouldSkipAutomation(tx, job(), now)).toBe(false);
    expect(db.quoteShare.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'context', quoteId: 'entity', organizationId: trial.organizationId,
        revokedAt: null, decision: null, changeRequestedAt: null, expiresAt: { gt: now },
      },
    }));

    for (const quote of [
      { version: 3, status: 'SENT', validUntil: future },
      { version: 2, status: 'APPROVED', validUntil: future },
      { version: 2, status: 'SENT', validUntil: now },
    ]) {
      db.quoteShare.findFirst.mockResolvedValueOnce({ quoteVersion: 2, quote });
      expect(await shouldSkipAutomation(tx, job(), now)).toBe(true);
    }

    expect(await shouldSkipAutomation(tx, job({ automationContextId: null }), now)).toBe(true);
  });

  it('suppresses reminders after rescheduling, starting or reaching the appointment', async () => {
    const { db, tx } = automationFixture();
    const reminder = job({ automationType: 'WORK_ORDER_REMINDER' });

    expect(await shouldSkipAutomation(tx, reminder, now)).toBe(false);
    expect(db.workOrder.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entity', organizationId: trial.organizationId },
    }));

    for (const order of [
      { status: 'IN_PROGRESS', scheduledStartAt: future },
      { status: 'SCHEDULED', scheduledStartAt: new Date(future.getTime() + 1) },
      { status: 'SCHEDULED', scheduledStartAt: null },
    ]) {
      db.workOrder.findFirst.mockResolvedValueOnce(order);
      expect(await shouldSkipAutomation(tx, reminder, now)).toBe(true);
    }

    expect(await shouldSkipAutomation(tx, reminder, future)).toBe(true);
  });

  it('does not request another review after submission or invitation revocation', async () => {
    const { db, tx } = automationFixture();
    const review = job({ automationType: 'REVIEW_REQUEST' });

    expect(await shouldSkipAutomation(tx, review, now)).toBe(false);
    expect(db.professionalReviewInvitation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'context', workOrderId: 'entity', revokedAt: null, usedAt: null,
        expiresAt: { gt: now }, workOrder: { organizationId: trial.organizationId },
      },
    }));

    db.professionalReviewInvitation.findFirst.mockResolvedValueOnce({
      workOrder: { status: 'COMPLETED', professionalReview: { id: 'review' } },
    });
    expect(await shouldSkipAutomation(tx, review, now)).toBe(true);
    db.professionalReviewInvitation.findFirst.mockResolvedValueOnce(null);
    expect(await shouldSkipAutomation(tx, review, now)).toBe(true);
  });

  it('distinguishes due-soon and overdue reminders and excludes settled or rescheduled payments', async () => {
    const { db, tx } = automationFixture();
    const dueSoon = job({ automationType: 'RECEIVABLE_DUE_SOON' });
    const overdue = job({ automationType: 'RECEIVABLE_OVERDUE', automationReferenceAt: past });

    expect(await shouldSkipAutomation(tx, dueSoon, now)).toBe(false);
    db.receivable.findFirst.mockResolvedValueOnce({ status: 'OPEN', dueAt: past });
    expect(await shouldSkipAutomation(tx, overdue, now)).toBe(false);

    for (const status of ['PAID', 'CANCELED']) {
      db.receivable.findFirst.mockResolvedValueOnce({ status, dueAt: future });
      expect(await shouldSkipAutomation(tx, dueSoon, now)).toBe(true);
    }

    expect(await shouldSkipAutomation(tx, overdue, now)).toBe(true);
    expect(await shouldSkipAutomation(tx, dueSoon, future)).toBe(true);
    expect(await shouldSkipAutomation(tx, job({ automationType: 'RECEIVABLE_DUE_SOON', automationReferenceAt: null }), now)).toBe(true);
  });
});
