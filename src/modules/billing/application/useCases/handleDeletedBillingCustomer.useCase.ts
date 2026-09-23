import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { BillingLock } from '../ports/billingLock.port.js';

interface HandleDeletedBillingCustomerParams {
  stripeCustomerId: string;
  deletedAt: Date;
}

export class HandleDeletedBillingCustomerUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly billingLock: BillingLock,
  ) {}

  async execute(params: HandleDeletedBillingCustomerParams): Promise<void> {
    const { stripeCustomerId, deletedAt } = params;

    const customer = await this.billingRepository.customerByStripeId(stripeCustomerId);

    if (customer === null || customer.stripeCustomerId !== stripeCustomerId) {
      return;
    }

    await this.billingLock.run(`organization:${customer.organizationId}`, () =>
      this.billingRepository.handleDeletedCustomer({
        organizationId: customer.organizationId,
        stripeCustomerId,
        deletedAt,
      }),
    );
  }
}
