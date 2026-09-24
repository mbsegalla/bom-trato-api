import type { PaymentMethodUpdateStatus } from '../../../../generated/prisma/enums.js';
import type { NotificationOutbox } from '../../../notifications/application/ports/notificationOutbox.port.js';

export interface StartCheckoutParams {
  organizationId: string;
  userId: string;
  planPriceId: string;
}

export interface StartCheckoutResult {
  attemptId: string;
  clientSecret: string;
}

export interface CreateBillingPortalParams {
  organizationId: string;
  userId: string;
}

export interface CreateBillingPortalResult {
  url: string;
}

export interface SyncBillingParams {
  organizationId: string;
  invoiceId?: string;
  includeInvoiceHistory?: boolean;
  reconcile?: boolean;
}

export interface ReadSubscriptionParams {
  organizationId: string;
  userId: string;
}

export interface SetCancellationParams {
  organizationId: string;
  userId: string;
  cancelAtPeriodEnd: boolean;
}

export interface PlanChangeOwnerParams {
  organizationId: string;
  userId: string;
}

export interface PreviewPlanChangeParams extends PlanChangeOwnerParams {
  planPriceId: string;
}

export interface PlanChangeActionParams extends PlanChangeOwnerParams {
  changeId: string;
}

export interface PaymentMethodOwnerParams {
  organizationId: string;
  userId: string;
}

export interface CompletePaymentMethodUpdateParams extends PaymentMethodOwnerParams {
  updateId: string;
}

export interface SynchronizePaymentMethodUpdateParams {
  organizationId: string;
  updateId?: string;
  setupIntentId?: string;
}

export interface PaymentMethodUpdateResult {
  updateId: string;
  status: PaymentMethodUpdateStatus;
  clientSecret: string | null;
}

export interface BillingSuccessRecipient {
  email: string;
  enabled: boolean;
}

export type BillingSuccessNotification =
  | {
      kind: 'INVOICE';
      id: string;
      stripeInvoiceId: string;
      billingReason: string | null;
      number: string | null;
      amountPaid: number;
      currency: string;
      paidAt: Date | null;
      subscriptionStatus: string;
      recipient: BillingSuccessRecipient;
    }
  | {
      kind: 'PLAN_CHANGE';
      id: string;
      organizationName: string;
      planName: string;
      appliedAt: Date;
      recipient: BillingSuccessRecipient;
    };

export interface BillingSuccessNotificationTransaction {
  billingSuccessNotification: BillingSuccessNotification;
  notificationOutbox: NotificationOutbox;
}
