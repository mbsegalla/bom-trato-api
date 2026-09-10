import type { PaymentMethodUpdateProps } from '../../domain/entities/paymentMethodUpdate.entity.js';

export type PaymentSetupStatus =
  'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'canceled' | 'succeeded';

export interface PaymentSetup {
  id: string;
  customerId: string | null;
  paymentMethodId: string | null;
  updateId: string | null;
  status: PaymentSetupStatus;
  clientSecret: string | null;
}

export interface SubscriptionPaymentParams {
  customerId: string;
  subscriptionId: string;
}

export interface ApplyPaymentMethodParams extends SubscriptionPaymentParams {
  updateId: string;
  paymentMethodId: string;
}

export interface CardSummary {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export abstract class PaymentMethodGateway {
  abstract createSetup(update: PaymentMethodUpdateProps): Promise<PaymentSetup>;
  abstract retrieveSetup(id: string): Promise<PaymentSetup>;
  abstract cancelSetup(id: string): Promise<PaymentSetup>;
  abstract apply(params: ApplyPaymentMethodParams): Promise<void>;
  abstract current(params: SubscriptionPaymentParams): Promise<CardSummary | null>;
}
