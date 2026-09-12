import type { PaymentMethodUpdateStatus } from '../../../../generated/prisma/enums.js';

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
