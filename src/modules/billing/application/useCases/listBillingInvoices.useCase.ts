import type { BillingRepository, InvoicePageParams } from '../../domain/repositories/billing.repository.js';

export class ListBillingInvoicesUseCase {
  constructor(private readonly billingRepository: BillingRepository) {}

  async execute({ userId, ...params }: InvoicePageParams & { userId: string }) {
    await this.billingRepository.assertOwner(params.organizationId, userId);

    return this.billingRepository.invoices(params);
  }
}
