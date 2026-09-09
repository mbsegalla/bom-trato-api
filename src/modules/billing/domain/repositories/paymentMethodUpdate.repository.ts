import type { PaymentMethodUpdateStatus } from '../../../../generated/prisma/enums.js';

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

export interface SaveSetupIntentParams {
  id: string;
  stripeSetupIntentId: string;
}

export interface FinishPaymentMethodUpdateParams {
  id: string;
  status: 'APPLIED' | 'CANCELED';
}

export abstract class PaymentMethodUpdateRepository {
  abstract create(params: CreatePaymentMethodUpdateParams): Promise<PaymentMethodUpdateProps>;
  abstract find(id: string): Promise<PaymentMethodUpdateProps | null>;
  abstract active(organizationId: string): Promise<PaymentMethodUpdateProps | null>;
  abstract saveSetupIntent(params: SaveSetupIntentParams): Promise<PaymentMethodUpdateProps>;
  abstract finish(params: FinishPaymentMethodUpdateParams): Promise<PaymentMethodUpdateProps>;
  abstract postpone(id: string, seconds: number): Promise<void>;
  abstract due(): Promise<PaymentMethodUpdateProps[]>;
}
