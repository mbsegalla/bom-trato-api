import { PaymentMethodUpdateStatus } from '../../../../generated/prisma/enums.js';
import { BillingError } from '../errors/billing.error.js';

export interface PaymentMethodUpdateProps {
  id: string;
  organizationId: string;
  requestedById: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeSetupIntentId: string | null;
  status: PaymentMethodUpdateStatus;
  consentVersion: string;
  consentAcceptedAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreatePaymentMethodUpdateParams {
  id: string;
  organizationId: string;
  requestedById: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  consentVersion: string;
  consentAcceptedAt: Date;
  expiresAt: Date;
}

export type PaymentSetupState =
  'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'canceled' | 'succeeded';

export interface PaymentSetupIdentity {
  id: string;
  customerId: string | null;
  updateId: string | null;
}

export class PaymentMethodUpdate {
  private constructor(private readonly props: PaymentMethodUpdateProps) {}

  static create(params: CreatePaymentMethodUpdateParams): PaymentMethodUpdate {
    return new PaymentMethodUpdate(
      structuredClone({
        ...params,
        status: PaymentMethodUpdateStatus.PENDING,
        stripeSetupIntentId: null,
        createdAt: new Date(params.consentAcceptedAt),
      }),
    );
  }

  static assertSubscriptionCanUpdate(status: string): void {
    if (!['ACTIVE', 'TRIALING', 'PAST_DUE', 'UNPAID', 'PAUSED'].includes(status)) {
      throw new BillingError('INVALID_SUBSCRIPTION_STATE');
    }
  }

  static restore(props: PaymentMethodUpdateProps): PaymentMethodUpdate {
    return new PaymentMethodUpdate(structuredClone(props));
  }

  isPending(): boolean {
    return this.props.status === PaymentMethodUpdateStatus.PENDING;
  }

  wasRequestedBy(userId: string): boolean {
    return this.props.requestedById === userId;
  }

  assertBelongsTo(organizationId: string): void {
    if (this.props.organizationId !== organizationId) {
      throw new BillingError('PAYMENT_METHOD_UPDATE_NOT_FOUND');
    }
  }

  assertCustomer(customerId: string | null): void {
    if (customerId !== this.props.stripeCustomerId) {
      throw new BillingError('INVALID_PAYMENT_METHOD_UPDATE');
    }
  }

  attachSetup({ id, customerId, updateId }: PaymentSetupIdentity): void {
    this.assertCustomer(customerId);

    if (
      updateId !== this.props.id ||
      (this.props.stripeSetupIntentId !== null && this.props.stripeSetupIntentId !== id)
    ) {
      throw new BillingError('INVALID_PAYMENT_METHOD_UPDATE');
    }

    this.props.stripeSetupIntentId = id;
  }

  shouldCancelSetup(status: PaymentSetupState, now: Date): boolean {
    return (
      this.isPending() &&
      now >= this.props.expiresAt &&
      status !== 'succeeded' &&
      status !== 'processing' &&
      status !== 'canceled'
    );
  }

  canConfirmSetup(status: PaymentSetupState, now: Date): boolean {
    return (
      this.isPending() &&
      now < this.props.expiresAt &&
      status !== 'processing' &&
      status !== 'succeeded' &&
      status !== 'canceled'
    );
  }

  markApplied(): void {
    this.finish(PaymentMethodUpdateStatus.APPLIED);
  }

  markCanceled(): void {
    this.finish(PaymentMethodUpdateStatus.CANCELED);
  }

  toPublic(clientSecret: string | null = null) {
    return {
      updateId: this.props.id,
      status: this.props.status,
      clientSecret,
    };
  }

  snapshot(): PaymentMethodUpdateProps {
    return structuredClone(this.props);
  }

  private finish(status: PaymentMethodUpdateStatus): void {
    if (this.props.status === status) {
      return;
    }

    if (!this.isPending()) {
      throw new BillingError('INVALID_PAYMENT_METHOD_UPDATE');
    }

    this.props.status = status;
  }
}
