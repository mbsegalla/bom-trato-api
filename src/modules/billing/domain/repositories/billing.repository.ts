import type { SubscriptionStatus } from '../../../../generated/prisma/enums.js';
import type { SubscriptionProps } from '../entities/subscription.entity.js';

export interface BillingCustomerProps {
  id: string;
  organizationId: string;
  stripeCustomerId: string | null;
  billingEmail: string;
  billingName: string;
  creationRequestedAt: Date | null;
}

export interface AvailablePrice {
  id: string;
  stripePriceId: string;
  stripeProductId: string;
  amountInCents: number;
  currency: string;
  interval: 'MONTH' | 'YEAR';
  intervalCount: number;
}

export interface CheckoutAttemptState {
  id: string;
  organizationId: string;
  planPriceId: string;
  stripePriceId: string;
  stripeSessionId: string | null;
  returnUrl: string;
  expiresAt: Date;
}

export interface RemoteSubscription {
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  endedAt: Date | null;
  stripeCreatedAt: Date;
}

export interface RemoteInvoice {
  stripeInvoiceId: string;
  stripeSubscriptionId: string;
  number: string | null;
  status: string;
  currency: string;
  amountDue: number;
  amountPaid: number;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  paidAt: Date | null;
  paidThrough: Date | null;
  stripeCreatedAt: Date;
}

export interface BillingSnapshot {
  subscriptions: RemoteSubscription[];
  invoices: RemoteInvoice[];
}

export interface WebhookNotice {
  id: string;
  type: string;
  stripeCustomerId: string;
  stripeObjectId: string;
}

export interface WebhookJob extends WebhookNotice {
  attempts: number;
}

export interface SaveSnapshotParams {
  organizationId: string;
  snapshot: BillingSnapshot;
  eventId?: string;
  checkout?: {
    id: string;
    stripeSessionId: string;
    status: 'COMPLETE' | 'EXPIRED';
  };
  nextReconcileAt?: Date;
}

export interface InvoicePageParams {
  organizationId: string;
  cursor?: string;
  limit: number;
}

export interface RemoteInvoiceView {
  id: string;
  number: string | null;
  status: string;
  currency: string;
  amountDue: number;
  amountPaid: number;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  paidAt: Date | null;
  stripeCreatedAt: Date;
}

export interface ClaimedWebhookJob extends WebhookJob {
  leaseToken: string;
}

export type WebhookOutcome = 'COMPLETE' | 'DEFER' | 'RETRY';

export abstract class BillingRepository {
  abstract assertOwner(organizationId: string, userId: string): Promise<void>;
  abstract assertMember(organizationId: string, userId: string): Promise<void>;
  abstract customer(organizationId: string): Promise<BillingCustomerProps>;
  abstract customerByStripeId(stripeCustomerId: string): Promise<BillingCustomerProps | null>;
  abstract markCustomerCreation(id: string, now: Date): Promise<void>;
  abstract setCustomerId(id: string, stripeCustomerId: string): Promise<void>;
  abstract availablePrice(id: string): Promise<AvailablePrice>;
  abstract currentSubscription(organizationId: string): Promise<SubscriptionProps | null>;
  abstract pendingCheckout(organizationId: string): Promise<CheckoutAttemptState | null>;
  abstract createCheckout(params: Omit<CheckoutAttemptState, 'stripeSessionId'>): Promise<CheckoutAttemptState>;
  abstract attachCheckout(id: string, stripeSessionId: string): Promise<void>;
  abstract closeCheckout(id: string, status: 'COMPLETE' | 'EXPIRED'): Promise<void>;
  abstract saveSnapshot(params: SaveSnapshotParams): Promise<void>;
  abstract invoices(params: InvoicePageParams): Promise<{ items: RemoteInvoiceView[]; nextCursor: string | null }>;
  abstract enqueue(notice: WebhookNotice): Promise<void>;
  abstract isProcessed(id: string): Promise<boolean>;
  abstract customerPage(cursor?: string): Promise<Array<{ organizationId: string; id: string }>>;
  abstract dueCustomers(): Promise<Array<{ organizationId: string }>>;
  abstract postponeReconciliation(organizationId: string): Promise<void>;
  abstract claimEvent(leaseToken: string): Promise<ClaimedWebhookJob | null>;
  abstract renewEventLease(event: ClaimedWebhookJob): Promise<boolean>;
  abstract settleEvent(event: ClaimedWebhookJob, outcome: WebhookOutcome, code?: string): Promise<boolean>;
  abstract entitlements(
    organizationId: string,
    userId: string,
  ): Promise<{ maxUsers: number; teamManagementEnabled: boolean; memberCount: number; isOwner: boolean }>;
}
