import type {
  AvailablePrice,
  BillingCustomerProps,
  CheckoutAttemptState,
} from '../../domain/repositories/billing.repository.js';
import type { BillingSnapshot, WebhookNotice } from '../../domain/types/billing.types.js';

export interface CheckoutResult {
  stripeSessionId: string;
  status: 'OPEN' | 'COMPLETE' | 'EXPIRED';
  clientSecret: string | null;
}

export interface CreateCheckoutParams {
  customerId: string;
  attempt: CheckoutAttemptState;
}

export interface InvoiceReconciliationOptions {
  createdSince: Date;
  pendingInvoiceIds: string[];
}

export abstract class BillingGateway {
  abstract findCustomer(customer: BillingCustomerProps): Promise<string | null>;
  abstract createCustomer(customer: BillingCustomerProps): Promise<string>;
  abstract validatePrice(price: AvailablePrice): Promise<void>;
  abstract createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult>;
  abstract checkout(id: string): Promise<CheckoutResult>;
  abstract findCheckout(customerId: string, attemptId: string): Promise<CheckoutResult | null>;
  abstract snapshot(
    customerId: string,
    invoiceId?: string,
    includeInvoiceHistory?: boolean,
    reconciliation?: InvoiceReconciliationOptions,
  ): Promise<BillingSnapshot>;
  abstract setCancellation(subscriptionId: string, cancelAtPeriodEnd: boolean): Promise<void>;
  abstract createPortal(customerId: string, returnUrl: string): Promise<string>;
  abstract verifyWebhook(body: Buffer, signature: string): WebhookNotice | null;
}
