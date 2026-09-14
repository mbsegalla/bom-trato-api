import Stripe from 'stripe';

import type {
  PlanChangeSubscriptionParams,
  RemotePlanChangeSource,
  RemotePlanChangeState,
} from '../../application/ports/planChangeGateway.port.js';
import { PlanChangeGateway } from '../../application/ports/planChangeGateway.port.js';
import type { PlanChangeProps } from '../../domain/entities/planChange.entity.js';
import { BillingError } from '../../domain/errors/billing.error.js';

function objectId(value: string | { id: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : (value?.id ?? null);
}

export class StripePlanChangeGateway extends PlanChangeGateway {
  constructor(private readonly stripe: Stripe) {
    super();
  }

  private async subscription(params: PlanChangeSubscriptionParams): Promise<Stripe.Subscription> {
    const { customerId, subscriptionId } = params;

    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);

    if (objectId(subscription.customer) !== customerId) {
      throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
    }

    return subscription;
  }

  async source(params: PlanChangeSubscriptionParams): Promise<RemotePlanChangeSource> {
    const subscription = await this.subscription(params);
    const item = subscription.items.data[0];

    if (
      item === undefined ||
      subscription.items.has_more ||
      subscription.items.data.length !== 1 ||
      item.quantity !== 1 ||
      subscription.status !== 'active' ||
      subscription.collection_method !== 'charge_automatically' ||
      subscription.cancel_at_period_end ||
      subscription.cancel_at !== null ||
      subscription.pending_update !== null ||
      subscription.schedule !== null ||
      subscription.pause_collection !== null
    ) {
      throw new BillingError('INVALID_SUBSCRIPTION_STATE');
    }

    if (
      subscription.discounts.length > 0 ||
      item.discounts.length > 0 ||
      (subscription.default_tax_rates?.length ?? 0) > 0 ||
      (item.tax_rates?.length ?? 0) > 0 ||
      subscription.automatic_tax.enabled ||
      subscription.billing_thresholds !== null ||
      item.billing_thresholds !== null ||
      subscription.transfer_data !== null ||
      subscription.on_behalf_of !== null ||
      subscription.application_fee_percent !== null ||
      item.price.billing_scheme !== 'per_unit' ||
      item.price.recurring?.usage_type !== 'licensed'
    ) {
      throw new BillingError('PLAN_CHANGE_UNSUPPORTED');
    }

    const invoiceId = objectId(subscription.latest_invoice);

    if (invoiceId === null || (await this.stripe.invoices.retrieve(invoiceId)).status !== 'paid') {
      throw new BillingError('INVALID_SUBSCRIPTION_STATE');
    }

    const pending = await this.stripe.invoiceItems.list({
      customer: params.customerId,
      pending: true,
      limit: 1,
    });

    if (pending.data.length > 0) {
      throw new BillingError('PLAN_CHANGE_UNSUPPORTED');
    }

    return {
      stripeItemId: item.id,
      stripePriceId: item.price.id,
      periodStart: item.current_period_start,
      periodEnd: item.current_period_end,
    };
  }

  async preview(change: PlanChangeProps): Promise<number> {
    if (change.mode === 'PERIOD_END') {
      return 0;
    }

    const invoice = await this.stripe.invoices.createPreview({
      customer: change.stripeCustomerId,
      subscription: change.stripeSubscriptionId,
      subscription_details: {
        items: [
          {
            id: change.stripeItemId,
            price: change.targetStripePriceId,
            quantity: 1,
          },
        ],
        proration_behavior: 'always_invoice',
        proration_date: change.prorationDate,
      },
    });

    if (invoice.currency !== change.currency) {
      throw new BillingError('PRICE_MISMATCH');
    }

    return invoice.amount_due;
  }

  async execute(change: PlanChangeProps): Promise<RemotePlanChangeState> {
    if (change.mode === 'IMMEDIATE') {
      await this.stripe.subscriptions.update(
        change.stripeSubscriptionId,
        {
          items: [
            {
              id: change.stripeItemId,
              price: change.targetStripePriceId,
              quantity: 1,
            },
          ],
          payment_behavior: 'pending_if_incomplete',
          proration_behavior: 'always_invoice',
          proration_date: change.prorationDate,
          metadata: {
            planChangeId: change.id,
          },
        },
        {
          idempotencyKey: `plan-change:${change.id}`,
        },
      );
    } else {
      const schedule = await this.stripe.subscriptionSchedules.create(
        {
          from_subscription: change.stripeSubscriptionId,
        },
        {
          idempotencyKey: `plan-change-schedule:${change.id}`,
        },
      );

      await this.stripe.subscriptionSchedules.update(
        schedule.id,
        {
          end_behavior: 'release',
          proration_behavior: 'none',
          metadata: {
            planChangeId: change.id,
            organizationId: change.organizationId,
          },
          phases: [
            {
              start_date: schedule.current_phase?.start_date ?? change.periodStart,
              end_date: change.periodEnd,
              items: [
                {
                  price: change.sourceStripePriceId,
                  quantity: 1,
                },
              ],
              proration_behavior: 'none',
            },
            {
              start_date: change.periodEnd,
              duration: {
                interval: change.targetInterval === 'MONTH' ? 'month' : 'year',
                interval_count: change.targetIntervalCount,
              },
              items: [
                {
                  price: change.targetStripePriceId,
                  quantity: 1,
                },
              ],
              proration_behavior: 'none',
              metadata: {
                planChangeId: change.id,
              },
            },
          ],
        },
        {
          idempotencyKey: `plan-change-phases:${change.id}`,
        },
      );
    }

    const result = await this.inspect(change);

    if (result === null) {
      throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
    }

    return result;
  }

  async inspect(change: PlanChangeProps): Promise<RemotePlanChangeState | null> {
    const subscription = await this.subscription({
      customerId: change.stripeCustomerId,
      subscriptionId: change.stripeSubscriptionId,
    });

    const item = subscription.items.data[0];

    if (
      item === undefined ||
      subscription.items.has_more ||
      subscription.items.data.length !== 1 ||
      item.quantity !== 1
    ) {
      throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
    }

    const scheduleId = objectId(subscription.schedule) ?? change.stripeScheduleId;

    const result = (
      status: RemotePlanChangeState['status'],
      invoiceId: string | null = null,
      clientSecret: string | null = null,
    ): RemotePlanChangeState => ({
      status,
      stripeInvoiceId: invoiceId,
      stripeScheduleId: scheduleId,
      clientSecret,
    });

    if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') {
      return result('CANCELED');
    }

    if (
      subscription.metadata.planChangeId === change.id &&
      item.price.id === change.targetStripePriceId &&
      subscription.pending_update === null
    ) {
      return result('APPLIED', objectId(subscription.latest_invoice));
    }

    if (change.mode === 'PERIOD_END') {
      if (scheduleId === null) {
        return change.status === 'SCHEDULED' ? result('CANCELED') : null;
      }

      const schedule = await this.stripe.subscriptionSchedules.retrieve(scheduleId);

      if (schedule.metadata?.planChangeId !== change.id) {
        return null;
      }

      if (schedule.status === 'released' || schedule.status === 'canceled') {
        return result('CANCELED');
      }

      const phase = schedule.phases.find(
        (candidate) =>
          candidate.start_date === change.periodEnd &&
          candidate.items.length === 1 &&
          objectId(candidate.items[0]?.price) === change.targetStripePriceId,
      );

      if (phase === undefined || item.price.id !== change.sourceStripePriceId) {
        throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
      }

      return result('SCHEDULED');
    }

    if (subscription.metadata.planChangeId !== change.id) {
      return null;
    }

    const invoiceId = change.stripeInvoiceId ?? objectId(subscription.latest_invoice);

    if (invoiceId === null) {
      throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
    }

    const invoice = await this.stripe.invoices.retrieve(invoiceId, {
      expand: ['confirmation_secret'],
    });

    if (
      objectId(invoice.customer) !== change.stripeCustomerId ||
      objectId(invoice.parent?.subscription_details?.subscription) !== change.stripeSubscriptionId
    ) {
      throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
    }

    if (invoice.status === 'void') {
      return result('EXPIRED', invoice.id);
    }

    if (subscription.pending_update !== null && invoice.status === 'open') {
      return result('PENDING_PAYMENT', invoice.id, invoice.confirmation_secret?.client_secret ?? null);
    }

    throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
  }

  async cancel(change: PlanChangeProps): Promise<void> {
    const state = await this.inspect(change);

    if (state === null || ['APPLIED', 'CANCELED', 'EXPIRED'].includes(state.status)) {
      return;
    }

    if (state.status === 'SCHEDULED' && state.stripeScheduleId !== null) {
      if (Date.now() >= change.periodEnd * 1000) {
        throw new BillingError('PLAN_CHANGE_CONFLICT');
      }

      await this.stripe.subscriptionSchedules.release(
        state.stripeScheduleId,
        { preserve_cancel_date: false },
        {
          idempotencyKey: `plan-change-release:${change.id}`,
        },
      );

      return;
    }

    if (state.status === 'PENDING_PAYMENT' && state.stripeInvoiceId !== null) {
      try {
        await this.stripe.invoices.voidInvoice(
          state.stripeInvoiceId,
          {},
          {
            idempotencyKey: `plan-change-void:${change.id}`,
          },
        );
      } catch (error: unknown) {
        // A payment can succeed while cancellation is in flight.
        if (error instanceof Stripe.errors.StripeInvalidRequestError) {
          const current = await this.inspect(change);

          if (current !== null && ['APPLIED', 'CANCELED', 'EXPIRED'].includes(current.status)) {
            return;
          }
        }

        throw error;
      }

      return;
    }

    throw new BillingError('PLAN_CHANGE_CONFLICT');
  }

  async releaseSchedule(change: PlanChangeProps): Promise<void> {
    if (change.mode !== 'PERIOD_END') {
      return;
    }

    const subscription = await this.subscription({
      customerId: change.stripeCustomerId,
      subscriptionId: change.stripeSubscriptionId,
    });

    const id = objectId(subscription.schedule);

    if (id === null) {
      return;
    }

    const schedule = await this.stripe.subscriptionSchedules.retrieve(id);

    if (schedule.metadata?.planChangeId !== change.id) {
      throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
    }

    if (schedule.status === 'active' || schedule.status === 'not_started') {
      await this.stripe.subscriptionSchedules.release(
        id,
        { preserve_cancel_date: false },
        {
          idempotencyKey: `plan-change-finish-schedule:${change.id}`,
        },
      );
    }
  }
}
