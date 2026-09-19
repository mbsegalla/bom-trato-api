import type { CustomerApplicationService } from '../services/customerApplicationService.service.js';
import type { CustomerByIdParams, CustomerOverview } from '../types/customer.types.js';

export class GetCustomerOverviewUseCase {
  constructor(private readonly processor: CustomerApplicationService) {}

  execute(params: CustomerByIdParams): Promise<CustomerOverview> {
    const { customerId } = params;

    return this.processor.read(params, async (context) => {
      const customer = await this.processor.load(context, customerId);

      const now = new Date();

      const summary = await context.customers.overviewSummary(customerId, now);

      return {
        customer: customer.snapshot(),
        summary,
        generatedAt: now,
      };
    });
  }
}
