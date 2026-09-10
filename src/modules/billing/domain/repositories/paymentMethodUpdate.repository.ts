import type { PaymentMethodUpdate, PaymentMethodUpdateProps } from '../entities/paymentMethodUpdate.entity.js';

export abstract class PaymentMethodUpdateRepository {
  abstract create(update: PaymentMethodUpdate): Promise<PaymentMethodUpdateProps>;
  abstract find(id: string): Promise<PaymentMethodUpdateProps | null>;
  abstract active(organizationId: string): Promise<PaymentMethodUpdateProps | null>;
  abstract save(update: PaymentMethodUpdate): Promise<PaymentMethodUpdateProps>;
  abstract postpone(id: string, seconds: number): Promise<void>;
  abstract due(): Promise<PaymentMethodUpdateProps[]>;
}
