import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';
import type { BillingLock } from '../ports/billingLock.port.js';

interface UpdateBillingCustomerNameParams {
  organizationId: string;
  name: string;
}

export class UpdateBillingCustomerNameUseCase {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly billingGateway: BillingGateway,
    private readonly billingLock: BillingLock,
  ) {}

  execute(params: UpdateBillingCustomerNameParams): Promise<void> {
    const { organizationId, name } = params;

    return this.billingLock.run(`organization:${organizationId}`, async () => {
      const customer = await this.billingRepository.customer(organizationId);

      if (customer.stripeCustomerId === null) {
        throw new BillingError('BILLING_RECONCILIATION_REQUIRED');
      }

      await this.billingGateway.updateCustomerName(customer.stripeCustomerId, name);
    });
  }
}
