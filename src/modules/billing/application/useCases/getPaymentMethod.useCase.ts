import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { CardSummary, PaymentMethodGateway } from '../ports/paymentMethodGateway.port.js';
import type { PaymentMethodOwnerParams } from '../types/billing.types.js';

export class GetPaymentMethodUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly paymentMethodGateway: PaymentMethodGateway,
  ) {}

  async execute({ organizationId, userId }: PaymentMethodOwnerParams): Promise<CardSummary | null> {
    await this.billingRepository.assertOwner(organizationId, userId);

    const customer = await this.billingRepository.customer(organizationId);

    const subscription = await this.billingRepository.currentSubscription(organizationId);

    if (customer.stripeCustomerId === null || subscription === null) {
      return null;
    }

    return this.paymentMethodGateway.current({
      customerId: customer.stripeCustomerId,
      subscriptionId: subscription.stripeSubscriptionId,
    });
  }
}
