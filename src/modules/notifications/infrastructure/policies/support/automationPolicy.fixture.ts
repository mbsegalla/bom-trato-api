import { type Mock, vi } from 'vitest';

import type { Prisma } from '../../../../../generated/prisma/client.js';
import type { NotificationJob } from '../../../application/types/notification.types.js';

export const now = new Date('2026-01-04T12:00:00Z');
export const day = 86400000;
export const trial = {
  id: '11111111-1111-4111-8111-111111111111',
  organizationId: 'org',
  ownerId: 'owner',
  startsAt: new Date(now.getTime() - 3 * day),
  expiresAt: new Date(now.getTime() + 11 * day),
  convertedAt: null,
  revokedAt: null,
};
export const trialRow = {
  ...trial,
  owner: { email: 'owner@example.invalid', emailVerifiedAt: now, disabledAt: null },
  organization: { id: trial.organizationId, ownerId: trial.ownerId, setupCompletedAt: now },
};
export const future = new Date(now.getTime() + 3600000);
export const past = new Date(now.getTime() - 3600000);

export function job(overrides: Partial<NotificationJob> = {}): NotificationJob {
  return {
    id: 'job',
    key: 'automation/fixture',
    type: 'QUOTE_FOLLOW_UP',
    encryptedPayload: 'fixture-encrypted',
    leaseToken: 'lease',
    attempts: 0,
    expiresAt: future,
    firstAttemptAt: null,
    organizationId: trial.organizationId,
    automationType: 'QUOTE_FOLLOW_UP',
    automationEntityId: 'entity',
    automationContextId: 'context',
    automationReferenceAt: future,
    ...overrides,
  };
}

type QueryRawMock = Mock<(parts: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>>;

interface AutomationFixtureDatabase {
  $queryRaw: QueryRawMock;
  organization: { findUnique: Mock };
  organizationTrial: { findUnique: Mock };
  organizationMember: { findUnique: Mock };
  subscription: { findFirst: Mock };
  billingInvoice: { findFirst: Mock };
  notificationOutbox: { count: Mock };
  quoteShare: { findFirst: Mock };
  quote: { findFirst: Mock };
  workOrder: { findFirst: Mock };
  professionalReviewInvitation: { findFirst: Mock };
  receivable: { findFirst: Mock };
}

interface AutomationFixture {
  db: AutomationFixtureDatabase;
  tx: Prisma.TransactionClient;
}

export function automationFixture(): AutomationFixture {
  const db: AutomationFixtureDatabase = {
    $queryRaw: vi.fn<(parts: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>>().mockResolvedValue([{ id: trial.organizationId }]),
    organization: { findUnique: vi.fn().mockResolvedValue({ trial, subscriptions: [] }) },
    organizationTrial: { findUnique: vi.fn().mockResolvedValue(trialRow) },
    organizationMember: { findUnique: vi.fn().mockResolvedValue({ role: 'OWNER' }) },
    subscription: { findFirst: vi.fn().mockResolvedValue(null) },
    billingInvoice: { findFirst: vi.fn().mockResolvedValue(null) },
    notificationOutbox: { count: vi.fn().mockResolvedValue(0) },
    quoteShare: { findFirst: vi.fn().mockResolvedValue({ quoteVersion: 2, quote: { version: 2, status: 'SENT', validUntil: future } }) },
    quote: { findFirst: vi.fn().mockResolvedValue(null) },
    workOrder: { findFirst: vi.fn().mockResolvedValue({ status: 'SCHEDULED', scheduledStartAt: future }) },
    professionalReviewInvitation: { findFirst: vi.fn().mockResolvedValue({ workOrder: { status: 'COMPLETED', professionalReview: null } }) },
    receivable: { findFirst: vi.fn().mockResolvedValue({ status: 'PARTIALLY_PAID', dueAt: future }) },
  };

  return { db, tx: db as unknown as Prisma.TransactionClient };
}
