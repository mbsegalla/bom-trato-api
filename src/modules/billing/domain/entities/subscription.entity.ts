import { SubscriptionStatus } from '../../../../generated/prisma/enums.js';
import { BillingError } from '../errors/billing.error.js';

export interface SubscriptionProps {
  id: string;
  organizationId: string;
  planPriceId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  paidThrough: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  endedAt: Date | null;
  stripeCreatedAt: Date;
}

export class Subscription {
  private constructor(private readonly state: SubscriptionProps) {}

  static restore(state: SubscriptionProps): Subscription {
    return new Subscription(structuredClone(state));
  }

  static blocksNewCheckout(status: SubscriptionStatus): boolean {
    return status !== SubscriptionStatus.CANCELED && status !== SubscriptionStatus.INCOMPLETE_EXPIRED;
  }

  hasAccessAt(now: Date): boolean {
    return (
      (this.state.status === SubscriptionStatus.ACTIVE || this.state.status === SubscriptionStatus.PAST_DUE) &&
      this.state.endedAt === null &&
      this.state.paidThrough !== null &&
      this.state.paidThrough > now
    );
  }

  assertCanChangeCancellation(): void {
    if (
      this.state.status !== SubscriptionStatus.ACTIVE &&
      this.state.status !== SubscriptionStatus.PAST_DUE &&
      this.state.status !== SubscriptionStatus.TRIALING
    ) {
      throw new BillingError('INVALID_SUBSCRIPTION_STATE');
    }
  }

  toPublic(now: Date) {
    return {
      id: this.state.id,
      organizationId: this.state.organizationId,
      planPriceId: this.state.planPriceId,
      status: this.state.status,
      currentPeriodStart: this.state.currentPeriodStart,
      currentPeriodEnd: this.state.currentPeriodEnd,
      paidThrough: this.state.paidThrough,
      cancelAtPeriodEnd: this.state.cancelAtPeriodEnd,
      hasAccess: this.hasAccessAt(now),
    };
  }

  snapshot(): SubscriptionProps {
    return structuredClone(this.state);
  }
}
