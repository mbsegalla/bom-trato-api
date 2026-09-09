import { BillingError } from '../../domain/errors/billing.error.js';
import type { BillingRepository } from '../../domain/repositories/billing.repository.js';
import type { BillingGateway } from '../ports/billingGateway.port.js';

export interface CreateBillingPortalParams {
  organizationId: string;
  userId: string;
}

export interface CreateBillingPortalResult {
  url: string;
}

export class CreateBillingPortalUseCase {
  constructor(
    private readonly repository: BillingRepository,
    private readonly gateway: BillingGateway,
    private readonly frontendUrl: string,
  ) {}

  async execute(params: CreateBillingPortalParams): Promise<CreateBillingPortalResult> {
    const { organizationId, userId } = params;

    await this.repository.assertOwner(organizationId, userId);

    const customer = await this.repository.customer(organizationId);

    if (customer.stripeCustomerId === null) {
      throw new BillingError('SUBSCRIPTION_NOT_FOUND');
    }

    const returnUrl = new URL('/billing', this.frontendUrl);

    returnUrl.searchParams.set('organizationId', organizationId);

    return {
      url: await this.gateway.createPortal(customer.stripeCustomerId, returnUrl.toString()),
    };
  }
}
