import type { CustomerApplicationService } from '../services/customerApplicationService.service.js';
import type { CustomerByIdParams } from '../types/manageCustomers.types.js';

export class RestoreCustomerUseCase {
  constructor(private readonly processor: CustomerApplicationService) {}

  execute(params: CustomerByIdParams) {
    const { customerId } = params;

    return this.processor.run(params, async (tx) => {
      const customer = await this.processor.load(tx, customerId);

      customer.unarchive(new Date());

      await tx.customers.save(customer);

      return customer.snapshot();
    });
  }
}
