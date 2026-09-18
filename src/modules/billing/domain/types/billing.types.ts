import type { SubscriptionStatus } from '../../../../generated/prisma/enums.js';

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
  deletedInvoiceIds?: string[];
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

export interface ClaimedWebhookJob extends WebhookJob {
  leaseToken: string;
}

export type WebhookOutcome = 'COMPLETE' | 'DEFER' | 'RETRY';
