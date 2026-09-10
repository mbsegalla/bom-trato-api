import Stripe from 'stripe';

import type {
  ApplyPaymentMethodParams,
  CardSummary,
  PaymentSetup,
  SubscriptionPaymentParams,
} from '../../application/ports/paymentMethodGateway.port.js';
import { PaymentMethodGateway } from '../../application/ports/paymentMethodGateway.port.js';
import type { PaymentMethodUpdateProps } from '../../domain/entities/paymentMethodUpdate.entity.js';
import { BillingError } from '../../domain/errors/billing.error.js';

function objectId(value: string | { id: string } | null): string | null {
  return typeof value === 'string' ? value : (value?.id ?? null);
}

function toSetup(intent: Stripe.SetupIntent): PaymentSetup {
  return {
    id: intent.id,
    customerId: objectId(intent.customer),
    paymentMethodId: objectId(intent.payment_method),
    updateId: intent.metadata?.paymentMethodUpdateId ?? null,
    status: intent.status as PaymentSetup['status'],
    clientSecret: intent.client_secret,
  };
}

const terminalStatuses = new Set(['canceled', 'incomplete_expired']);

const supportedStatuses = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused']);

export class StripePaymentMethodGateway extends PaymentMethodGateway {
  constructor(private readonly stripe: Stripe) {
    super();
  }

  async createSetup(update: PaymentMethodUpdateProps): Promise<PaymentSetup> {
    const intent = await this.stripe.setupIntents.create(
      {
        customer: update.stripeCustomerId,
        usage: 'off_session',
        payment_method_types: ['card'],
        metadata: {
          paymentMethodUpdateId: update.id,
          organizationId: update.organizationId,
          subscriptionId: update.stripeSubscriptionId,
        },
      },
      {
        idempotencyKey: `payment-method-setup:${update.id}`,
      },
    );

    return toSetup(intent);
  }

  async retrieveSetup(id: string): Promise<PaymentSetup> {
    return toSetup(await this.stripe.setupIntents.retrieve(id));
  }

  async cancelSetup(id: string): Promise<PaymentSetup> {
    try {
      return toSetup(await this.stripe.setupIntents.cancel(id));
    } catch (error: unknown) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError) {
        const current = await this.retrieveSetup(id);

        if (current.status === 'succeeded' || current.status === 'processing' || current.status === 'canceled') {
          return current;
        }
      }

      throw error;
    }
  }

  private async subscription({ customerId, subscriptionId }: SubscriptionPaymentParams): Promise<Stripe.Subscription> {
    const ongoing: Stripe.Subscription[] = [];

    for await (const subscription of this.stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
    })) {
      if (!terminalStatuses.has(subscription.status)) {
        ongoing.push(subscription);
      }

      if (ongoing.length > 1) {
        throw new BillingError('MULTIPLE_SUBSCRIPTIONS');
      }
    }

    const subscription = ongoing[0];

    if (
      subscription === undefined ||
      subscription.id !== subscriptionId ||
      objectId(subscription.customer) !== customerId ||
      !supportedStatuses.has(subscription.status) ||
      subscription.collection_method !== 'charge_automatically'
    ) {
      throw new BillingError('INVALID_SUBSCRIPTION_STATE');
    }

    return subscription;
  }

  async apply({ customerId, subscriptionId, updateId, paymentMethodId }: ApplyPaymentMethodParams): Promise<void> {
    const subscription = await this.subscription({
      customerId,
      subscriptionId,
    });

    const scheduleId = objectId(subscription.schedule);

    if (scheduleId !== null) {
      const schedule = await this.stripe.subscriptionSchedules.retrieve(scheduleId);

      if (!schedule.metadata?.planChangeId || schedule.phases.some((phase) => phase.default_payment_method !== null)) {
        throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
      }
    }

    const paymentMethod = await this.stripe.paymentMethods.retrieve(paymentMethodId);

    if (objectId(paymentMethod.customer) !== customerId || paymentMethod.type !== 'card') {
      throw new BillingError('INVALID_PAYMENT_METHOD_UPDATE');
    }

    await this.stripe.subscriptions.update(
      subscriptionId,
      {
        default_payment_method: paymentMethodId,
      },
      {
        idempotencyKey: `payment-method-subscription:${updateId}`,
      },
    );

    await this.stripe.customers.update(
      customerId,
      {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      },
      {
        idempotencyKey: `payment-method-customer:${updateId}`,
      },
    );

    if (scheduleId !== null) {
      await this.stripe.subscriptionSchedules.update(
        scheduleId,
        {
          default_settings: {
            default_payment_method: paymentMethodId,
          },
        },
        {
          idempotencyKey: `payment-method-schedule:${updateId}`,
        },
      );
    }
  }

  async current({ customerId, subscriptionId }: SubscriptionPaymentParams): Promise<CardSummary | null> {
    const subscription = await this.subscription({
      customerId,
      subscriptionId,
    });

    let paymentMethodId = objectId(subscription.default_payment_method);

    if (paymentMethodId === null) {
      const customer = await this.stripe.customers.retrieve(customerId);

      if (customer.deleted) {
        throw new BillingError('SUBSCRIPTION_NOT_FOUND');
      }

      if (subscription.default_source !== null) {
        return null;
      }

      paymentMethodId = objectId(customer.invoice_settings.default_payment_method);
    }

    if (paymentMethodId === null) {
      return null;
    }

    const paymentMethod = await this.stripe.paymentMethods.retrieve(paymentMethodId);

    if (
      objectId(paymentMethod.customer) !== customerId ||
      paymentMethod.type !== 'card' ||
      paymentMethod.card === undefined
    ) {
      return null;
    }

    return {
      brand: paymentMethod.card.brand,
      last4: paymentMethod.card.last4,
      expMonth: paymentMethod.card.exp_month,
      expYear: paymentMethod.card.exp_year,
    };
  }
}
