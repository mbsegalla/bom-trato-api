import type { Prisma } from '../../../../generated/prisma/client.js';
import { OrganizationRole } from '../../../../generated/prisma/enums.js';
import { readOrganizationPlatformAccess } from '../../../organizations/infrastructure/access/prismaOrganizationPlatformAccess.js';
import type { EnqueueNotification, NotificationJob } from '../../application/types/notification.types.js';
import type { TrialLifecycleWindow } from '../../domain/policies/trialLifecycle.policy.js';
import { TrialLifecyclePolicy, TrialLifecycleStage } from '../../domain/policies/trialLifecycle.policy.js';

interface TrialLifecycleRecipient {
  organizationId: string;
  ownerId: string;
  email: string;
}

const trialLifecycleKeyPattern =
  /^trial-lifecycle\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[A-Z_]+$/i;

export async function readTrialLifecycleNotification(
  db: Prisma.TransactionClient,
  trialId: string,
  now: Date,
): Promise<EnqueueNotification | null> {
  const trial = await db.organizationTrial.findUnique({
    where: {
      id: trialId,
    },
    include: {
      owner: {
        select: {
          email: true,
          emailVerifiedAt: true,
          disabledAt: true,
        },
      },
      organization: {
        select: {
          id: true,
          ownerId: true,
          setupCompletedAt: true,
        },
      },
    },
  });

  if (trial === null) {
    return null;
  }

  const window = TrialLifecyclePolicy.resolve(trial, now);

  if (window === null) {
    return null;
  }

  const organization = trial.organization;

  if (
    organization === null ||
    organization.ownerId !== trial.ownerId ||
    organization.setupCompletedAt === null ||
    trial.owner.disabledAt !== null ||
    trial.owner.emailVerifiedAt === null
  ) {
    return null;
  }

  const recipient: TrialLifecycleRecipient = {
    organizationId: organization.id,
    ownerId: trial.ownerId,
    email: trial.owner.email,
  };

  if (!(await isEligibleRecipient(db, recipient))) {
    return null;
  }

  if (!(await isEligiblePlatformAccess(db, recipient.organizationId, trial.id, window, now))) {
    return null;
  }

  if (!(await isApplicableStage(db, recipient.organizationId, window.stage))) {
    return null;
  }

  return {
    key: TrialLifecyclePolicy.key(trial.id, window.stage),
    recipient: recipient.email,
    availableAt: window.availableAt,
    expiresAt: window.expiresAt,
    content: {
      type: 'TRIAL_LIFECYCLE',
      stage: window.stage,
      organizationId: recipient.organizationId,
      trialExpiresAt: trial.expiresAt.toISOString(),
    },
  };
}

async function isEligibleRecipient(db: Prisma.TransactionClient, recipient: TrialLifecycleRecipient): Promise<boolean> {
  const member = await db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: recipient.organizationId,
        userId: recipient.ownerId,
      },
    },
    select: {
      role: true,
    },
  });

  return member?.role === OrganizationRole.OWNER;
}

async function isEligiblePlatformAccess(
  db: Prisma.TransactionClient,
  organizationId: string,
  trialId: string,
  window: TrialLifecycleWindow,
  now: Date,
): Promise<boolean> {
  const { access, trial, hasPaidSubscriptionHistory } = await readOrganizationPlatformAccess(db, organizationId, now);

  if (trial?.id !== trialId || access.billingNeedsReconciliation || hasPaidSubscriptionHistory) {
    return false;
  }

  if (window.stage === TrialLifecycleStage.Expired) {
    return !access.hasAccess && access.source === 'NONE';
  }

  return access.hasAccess && access.source === 'TRIAL';
}

async function isApplicableStage(
  db: Prisma.TransactionClient,
  organizationId: string,
  stage: TrialLifecycleStage,
): Promise<boolean> {
  if (stage !== TrialLifecycleStage.FirstQuote) {
    return true;
  }

  const quote = await db.quote.findFirst({
    where: {
      organizationId,
    },
    select: {
      id: true,
    },
  });

  return quote === null;
}

export async function shouldSkipTrialLifecycle(
  db: Prisma.TransactionClient,
  job: NotificationJob,
  recipient: string,
  now: Date,
): Promise<boolean> {
  if (job.type !== 'TRIAL_LIFECYCLE') {
    return false;
  }

  const match = trialLifecycleKeyPattern.exec(job.key);

  if (match === null || job.organizationId === null) {
    return true;
  }

  const notification = await readTrialLifecycleNotification(db, match[1], now);

  if (notification === null || notification.content.type !== 'TRIAL_LIFECYCLE') {
    return true;
  }

  return (
    notification.key !== job.key ||
    notification.recipient !== recipient ||
    notification.content.organizationId !== job.organizationId ||
    notification.expiresAt.getTime() !== job.expiresAt.getTime()
  );
}
