import type { CustomerApplicationService } from '../services/customerApplicationService.service.js';
import type { CustomerByIdParams } from '../types/manageCustomers.types.js';

export class GetCustomerUseCase {
  constructor(private readonly processor: CustomerApplicationService) {}

  execute(params: CustomerByIdParams) {
    const { customerId } = params;

    return this.processor.run(params, async (tx) => {
      const customer = await this.processor.load(tx, customerId);

      return customer.snapshot();
    });
  }
}
