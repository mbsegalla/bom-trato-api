import type Stripe from 'stripe';

import type { SubscriptionStatus } from '../../../../generated/prisma/enums.js';
import type { CheckoutResult, CreateCheckoutParams } from '../../application/ports/billingGateway.port.js';
import { BillingGateway } from '../../application/ports/billingGateway.port.js';
import { BillingError } from '../../domain/errors/billing.error.js';
import type {
  AvailablePrice,
  BillingCustomerProps,
  BillingSnapshot,
  RemoteInvoice,
  RemoteSubscription,
  WebhookNotice,
} from '../../domain/repositories/billing.repository.js';

const supportedEvents = new Set([
  'checkout.session.completed',
  'checkout.session.expired',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.pending_update_applied',
  'customer.subscription.pending_update_expired',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.finalization_failed',
  'invoice.updated',
  'invoice.voided',
  'invoice.marked_uncollectible',
  'setup_intent.succeeded',
  'setup_intent.setup_failed',
  'setup_intent.canceled',
  'subscription_schedule.updated',
  'subscription_schedule.completed',
  'subscription_schedule.released',
  'subscription_schedule.canceled',
  'subscription_schedule.aborted',
]);

function date(seconds: number): Date {
  return new Date(seconds * 1000);
}

function nullableDate(seconds: number | null): Date | null {
  return seconds === null ? null : date(seconds);
}

function objectId(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && value !== null && 'id' in value) {
    return typeof value.id === 'string' ? value.id : null;
  }

  return null;
}

function status(value: string): SubscriptionStatus {
  switch (value) {
    case 'incomplete':
      return 'INCOMPLETE';
    case 'incomplete_expired':
      return 'INCOMPLETE_EXPIRED';
    case 'trialing':
      return 'TRIALING';
    case 'active':
      return 'ACTIVE';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
      return 'CANCELED';
    case 'unpaid':
      return 'UNPAID';
    case 'paused':
      return 'PAUSED';
    default:
      throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
  }
}

export class StripeBillingGateway extends BillingGateway {
  constructor(
    private readonly stripe: Stripe,
    private readonly webhookSecret: string,
    private readonly portalConfigurationId?: string,
  ) {
    super();
  }

  async findCustomer(customer: BillingCustomerProps): Promise<string | null> {
    if (customer.creationRequestedAt === null) {
      return null;
    }

    const requestedAt = Math.floor(customer.creationRequestedAt.getTime() / 1000);

    let found: string | null = null;

    for await (const remote of this.stripe.customers.list({
      created: {
        gte: requestedAt - 300,
        lte: requestedAt + 24 * 60 * 60,
      },
      limit: 100,
    })) {
      if (
        remote.metadata.billingCustomerId !== customer.id ||
        remote.metadata.organizationId !== customer.organizationId
      ) {
        continue;
      }

      if (found !== null) {
        throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
      }

      found = remote.id;
    }

    return found;
  }

  async createCustomer(customer: BillingCustomerProps): Promise<string> {
    const result = await this.stripe.customers.create(
      {
        email: customer.billingEmail,
        name: customer.billingName,
        metadata: {
          organizationId: customer.organizationId,
          billingCustomerId: customer.id,
        },
      },
      { idempotencyKey: `billing-customer:${customer.id}` },
    );

    return result.id;
  }

  async validatePrice(local: AvailablePrice): Promise<void> {
    const price = await this.stripe.prices.retrieve(local.stripePriceId);
    const product = await this.stripe.products.retrieve(local.stripeProductId);

    if (
      product.deleted ||
      !product.active ||
      !price.active ||
      objectId(price.product) !== local.stripeProductId ||
      price.type !== 'recurring' ||
      price.billing_scheme !== 'per_unit' ||
      price.transform_quantity !== null ||
      price.unit_amount !== local.amountInCents ||
      price.currency !== local.currency.toLowerCase() ||
      price.currency !== 'brl' ||
      price.recurring?.interval !== local.interval.toLowerCase() ||
      price.recurring.interval_count !== local.intervalCount ||
      price.recurring.usage_type !== 'licensed'
    ) {
      throw new BillingError('PRICE_MISMATCH');
    }
  }

  private checkoutResult(session: Stripe.Checkout.Session): CheckoutResult {
    return {
      stripeSessionId: session.id,
      status: session.status === 'complete' ? 'COMPLETE' : session.status === 'expired' ? 'EXPIRED' : 'OPEN',
      clientSecret: session.client_secret,
    };
  }

  async createCheckout({ customerId, attempt }: CreateCheckoutParams): Promise<CheckoutResult> {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        ui_mode: 'elements',
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: attempt.stripePriceId,
            quantity: 1,
          },
        ],
        return_url: attempt.returnUrl,
        expires_at: Math.floor(attempt.expiresAt.getTime() / 1000),
        client_reference_id: attempt.organizationId,
        metadata: {
          organizationId: attempt.organizationId,
          checkoutAttemptId: attempt.id,
        },
        subscription_data: {
          metadata: {
            organizationId: attempt.organizationId,
            checkoutAttemptId: attempt.id,
          },
        },
      },
      {
        idempotencyKey: `checkout-attempt:${attempt.id}`,
      },
    );

    return this.checkoutResult(session);
  }

  async checkout(id: string): Promise<CheckoutResult> {
    return this.checkoutResult(await this.stripe.checkout.sessions.retrieve(id));
  }

  async findCheckout(customerId: string, attemptId: string): Promise<CheckoutResult | null> {
    for await (const session of this.stripe.checkout.sessions.list({
      customer: customerId,
      limit: 100,
    })) {
      if (session.metadata?.checkoutAttemptId === attemptId) {
        return this.checkoutResult(session);
      }
    }

    return null;
  }

  private async invoice(id: string, customerId: string): Promise<RemoteInvoice | null> {
    const invoice = await this.stripe.invoices.retrieve(id);

    if (objectId(invoice.customer) !== customerId) {
      throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
    }

    const subscriptionId = objectId(invoice.parent?.subscription_details?.subscription);

    if (subscriptionId === null) {
      return null;
    }

    let paidThrough: Date | null = null;

    if (
      invoice.status === 'paid' &&
      (invoice.billing_reason === 'subscription_create' || invoice.billing_reason === 'subscription_cycle')
    ) {
      for await (const line of this.stripe.invoices.listLineItems(id, { limit: 100 })) {
        const details = line.parent?.subscription_item_details;

        if (details?.subscription === subscriptionId && !details.proration) {
          const end = date(line.period.end);

          if (paidThrough === null || end > paidThrough) {
            paidThrough = end;
          }
        }
      }
    }

    return {
      stripeInvoiceId: invoice.id,
      stripeSubscriptionId: subscriptionId,
      number: invoice.number,
      status: invoice.status ?? 'draft',
      currency: invoice.currency,
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdf: invoice.invoice_pdf ?? null,
      paidAt: nullableDate(invoice.status_transitions.paid_at),
      paidThrough,
      stripeCreatedAt: date(invoice.created),
    };
  }

  async snapshot(customerId: string, invoiceId?: string, includeInvoiceHistory = false): Promise<BillingSnapshot> {
    const subscriptions: RemoteSubscription[] = [];
    const invoiceIds = new Set<string>();

    if (invoiceId !== undefined) {
      invoiceIds.add(invoiceId);
    }

    for await (const remote of this.stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
    })) {
      const item = remote.items.data[0];

      if (item === undefined || remote.items.has_more || remote.items.data.length !== 1 || item.quantity !== 1) {
        throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
      }

      subscriptions.push({
        stripeSubscriptionId: remote.id,
        stripePriceId: item.price.id,
        status: status(remote.status),
        currentPeriodStart: date(item.current_period_start),
        currentPeriodEnd: date(item.current_period_end),
        cancelAtPeriodEnd: remote.cancel_at_period_end,
        canceledAt: nullableDate(remote.canceled_at),
        endedAt: nullableDate(remote.ended_at),
        stripeCreatedAt: date(remote.created),
      });

      const latestInvoiceId = objectId(remote.latest_invoice);

      if (latestInvoiceId !== null) {
        invoiceIds.add(latestInvoiceId);
      }
    }

    if (includeInvoiceHistory) {
      for await (const invoice of this.stripe.invoices.list({
        customer: customerId,
        limit: 100,
      })) {
        if (objectId(invoice.parent?.subscription_details?.subscription) !== null) {
          invoiceIds.add(invoice.id);
        }
      }
    }

    const invoices: RemoteInvoice[] = [];

    for (const id of invoiceIds) {
      const invoice = await this.invoice(id, customerId);

      if (invoice !== null) {
        invoices.push(invoice);
      }
    }

    return { subscriptions, invoices };
  }

  async setCancellation(subscriptionId: string, cancelAtPeriodEnd: boolean): Promise<void> {
    await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: cancelAtPeriodEnd,
    });
  }

  async createPortal(customerId: string, returnUrl: string): Promise<string> {
    if (this.portalConfigurationId === undefined) {
      throw new BillingError('BILLING_PORTAL_UNAVAILABLE');
    }

    const configuration = await this.stripe.billingPortal.configurations.retrieve(this.portalConfigurationId);

    // Plan changes and immediate cancellation are outside this billing policy.
    if (
      !configuration.active ||
      !configuration.features.payment_method_update.enabled ||
      configuration.features.subscription_update.enabled ||
      (configuration.features.subscription_cancel.enabled &&
        configuration.features.subscription_cancel.mode !== 'at_period_end')
    ) {
      throw new BillingError('BILLING_PORTAL_UNAVAILABLE');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      configuration: this.portalConfigurationId,
      return_url: returnUrl,
    });

    return session.url;
  }

  verifyWebhook(body: Buffer, signature: string): WebhookNotice | null {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(body, signature, this.webhookSecret);
    } catch {
      throw new BillingError('INVALID_WEBHOOK');
    }

    if (!supportedEvents.has(event.type)) {
      return null;
    }

    const object: unknown = event.data.object;

    if (typeof object !== 'object' || object === null || !('customer' in object)) {
      return null;
    }

    const customerId = objectId(object.customer);
    const id = objectId(object);

    if (customerId === null || id === null) {
      return null;
    }

    return {
      id: event.id,
      type: event.type,
      stripeCustomerId: customerId,
      stripeObjectId: id,
    };
  }
}
