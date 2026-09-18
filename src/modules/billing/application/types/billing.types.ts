import type { PaymentMethodUpdateStatus } from '../../../../generated/prisma/enums.js';

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
