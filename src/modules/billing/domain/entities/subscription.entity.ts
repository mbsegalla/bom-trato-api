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
  private constructor(private readonly props: SubscriptionProps) {}

  static restore(props: SubscriptionProps): Subscription {
    return new Subscription(structuredClone(props));
  }

  static blocksNewCheckout(status: SubscriptionStatus): boolean {
    return status !== SubscriptionStatus.CANCELED && status !== SubscriptionStatus.INCOMPLETE_EXPIRED;
  }

  hasAccessAt(now: Date): boolean {
    return (
      (this.props.status === SubscriptionStatus.ACTIVE || this.props.status === SubscriptionStatus.PAST_DUE) &&
      this.props.endedAt === null &&
      this.props.paidThrough !== null &&
      this.props.paidThrough > now
    );
  }

  assertCanChangeCancellation(): void {
    if (
      this.props.status !== SubscriptionStatus.ACTIVE &&
      this.props.status !== SubscriptionStatus.PAST_DUE &&
      this.props.status !== SubscriptionStatus.TRIALING
    ) {
      throw new BillingError('INVALID_SUBSCRIPTION_STATE');
    }
  }

  toPublic(now: Date) {
    return {
      id: this.props.id,
      organizationId: this.props.organizationId,
      planPriceId: this.props.planPriceId,
      status: this.props.status,
      currentPeriodStart: this.props.currentPeriodStart,
      currentPeriodEnd: this.props.currentPeriodEnd,
      paidThrough: this.props.paidThrough,
      cancelAtPeriodEnd: this.props.cancelAtPeriodEnd,
      hasAccess: this.hasAccessAt(now),
    };
  }

  snapshot(): SubscriptionProps {
    return structuredClone(this.props);
  }
}
