import type { Prisma } from '../../../../generated/prisma/client.js';
import { AutomationType, QuoteStatus, ReceivableStatus, WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import { readOrganizationPlatformAccess } from '../../../organizations/infrastructure/access/prismaOrganizationPlatformAccess.js';
import type { NotificationJob } from '../../application/types/notification.types.js';

interface AutomationDeliveryContext {
  organizationId: string;
  entityId: string;
  contextId: string | null;
  referenceAt: Date | null;
  now: Date;
}

async function canDeliverQuoteFollowUp(
  db: Prisma.TransactionClient,
  context: AutomationDeliveryContext,
): Promise<boolean> {
  const { organizationId, entityId, contextId, now } = context;

  if (contextId === null) {
    return false;
  }

  const share = await db.quoteShare.findFirst({
    where: {
      id: contextId,
      quoteId: entityId,
      organizationId,
      revokedAt: null,
      decision: null,
      changeRequestedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    select: {
      quoteVersion: true,
      quote: {
        select: {
          version: true,
          status: true,
          validUntil: true,
        },
      },
    },
  });

  return (
    share !== null &&
    share.quote.status === QuoteStatus.SENT &&
    share.quote.version === share.quoteVersion &&
    (share.quote.validUntil === null || share.quote.validUntil > now)
  );
}

async function canDeliverWorkOrderReminder(
  db: Prisma.TransactionClient,
  context: AutomationDeliveryContext,
): Promise<boolean> {
  const { organizationId, entityId, referenceAt, now } = context;

  if (referenceAt === null) {
    return false;
  }

  const order = await db.workOrder.findFirst({
    where: {
      id: entityId,
      organizationId,
    },
    select: {
      status: true,
      scheduledStartAt: true,
    },
  });

  return (
    order !== null &&
    order.status === WorkOrderStatus.SCHEDULED &&
    order.scheduledStartAt !== null &&
    order.scheduledStartAt.getTime() === referenceAt.getTime() &&
    order.scheduledStartAt > now
  );
}

async function canDeliverReviewRequest(
  db: Prisma.TransactionClient,
  context: AutomationDeliveryContext,
): Promise<boolean> {
  const { organizationId, entityId, contextId, now } = context;

  if (contextId === null) {
    return false;
  }

  const invitation = await db.professionalReviewInvitation.findFirst({
    where: {
      id: contextId,
      workOrderId: entityId,
      revokedAt: null,
      usedAt: null,
      expiresAt: {
        gt: now,
      },
      workOrder: {
        organizationId,
      },
    },
    select: {
      workOrder: {
        select: {
          status: true,
          professionalReview: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  return (
    invitation !== null &&
    invitation.workOrder.status === WorkOrderStatus.COMPLETED &&
    invitation.workOrder.professionalReview === null
  );
}

async function canDeliverReceivableReminder(
  db: Prisma.TransactionClient,
  context: AutomationDeliveryContext,
  type: typeof AutomationType.RECEIVABLE_DUE_SOON | typeof AutomationType.RECEIVABLE_OVERDUE,
): Promise<boolean> {
  const { organizationId, entityId, referenceAt, now } = context;

  if (referenceAt === null) {
    return false;
  }

  const receivable = await db.receivable.findFirst({
    where: {
      id: entityId,
      organizationId,
    },
    select: {
      status: true,
      dueAt: true,
    },
  });

  if (receivable === null || receivable.dueAt.getTime() !== referenceAt.getTime()) {
    return false;
  }

  const isOpen = receivable.status === ReceivableStatus.OPEN || receivable.status === ReceivableStatus.PARTIALLY_PAID;

  if (!isOpen) {
    return false;
  }

  return type === AutomationType.RECEIVABLE_DUE_SOON ? receivable.dueAt > now : receivable.dueAt < now;
}

export async function shouldSkipAutomation(
  db: Prisma.TransactionClient,
  job: NotificationJob,
  now: Date,
): Promise<boolean> {
  if (job.automationType === null) {
    return false;
  }

  if (job.organizationId === null || job.automationEntityId === null) {
    return true;
  }

  const { access } = await readOrganizationPlatformAccess(db, job.organizationId, now);

  if (!access.hasAccess || access.billingNeedsReconciliation) {
    return true;
  }

  const context: AutomationDeliveryContext = {
    organizationId: job.organizationId,
    entityId: job.automationEntityId,
    contextId: job.automationContextId,
    referenceAt: job.automationReferenceAt,
    now,
  };

  switch (job.automationType) {
    case AutomationType.QUOTE_FOLLOW_UP:
      return !(await canDeliverQuoteFollowUp(db, context));

    case AutomationType.WORK_ORDER_REMINDER:
      return !(await canDeliverWorkOrderReminder(db, context));

    case AutomationType.REVIEW_REQUEST:
      return !(await canDeliverReviewRequest(db, context));

    case AutomationType.RECEIVABLE_DUE_SOON:
    case AutomationType.RECEIVABLE_OVERDUE:
      return !(await canDeliverReceivableReminder(db, context, job.automationType));
  }
}
