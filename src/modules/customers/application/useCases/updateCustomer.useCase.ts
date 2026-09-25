import type { CustomerDetails } from '../../domain/entities/customer.entity.js';
import type { CustomerApplicationService } from '../services/customerApplicationService.service.js';
import type { CustomerByIdParams } from '../types/customer.types.js';

export class UpdateCustomerUseCase {
  constructor(private readonly processor: CustomerApplicationService) {}

  execute(params: CustomerByIdParams, details: Partial<CustomerDetails>) {
    const { customerId } = params;

    return this.processor.run(params, async (tx) => {
      const customer = await this.processor.load(tx, customerId);

      customer.update(details, new Date());

      const state = customer.snapshot();

      await this.processor.assertEmailAvailable(tx, state.email, customerId);

      await tx.customers.save(customer);

      return customer.snapshot();
    });
  }
}
