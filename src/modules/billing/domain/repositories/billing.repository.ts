import type { SubscriptionProps } from '../entities/subscription.entity.js';
import type { BillingSnapshot } from '../types/billing.types.js';

export interface BillingCustomerProps {
  id: string;
  organizationId: string;
  stripeCustomerId: string | null;
  billingEmail: string;
  billingName: string;
  creationRequestedAt: Date | null;
  invoiceHistorySyncedAt: Date | null;
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

export interface SaveSnapshotParams {
  organizationId: string;
  snapshot: BillingSnapshot;
  checkout?: {
    id: string;
    stripeSessionId: string;
    status: 'COMPLETE' | 'EXPIRED';
  };
  nextReconcileAt?: Date;
  invoiceHistorySyncedAt?: Date;
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
  abstract customerPage(cursor?: string): Promise<Array<{ organizationId: string; id: string }>>;
  abstract dueCustomers(): Promise<Array<{ organizationId: string }>>;
  abstract postponeReconciliation(organizationId: string): Promise<void>;
  abstract pendingInvoiceIds(organizationId: string): Promise<string[]>;
  abstract entitlements(
    organizationId: string,
    userId: string,
  ): Promise<{
    maxUsers: number;
    teamManagementEnabled: boolean;
    memberCount: number;
    isOwner: boolean;
  }>;
}
