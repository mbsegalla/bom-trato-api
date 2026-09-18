import type { CustomerApplicationService } from '../services/customerApplicationService.service.js';
import type { CustomerByIdParams } from '../types/customer.types.js';

export class GetCustomerUseCase {
  constructor(private readonly processor: CustomerApplicationService) {}

  execute(params: CustomerByIdParams) {
    const { customerId } = params;

    return this.processor.read(params, async (context) => {
      const customer = await this.processor.load(context, customerId);

      return customer.snapshot();
    });
  }
}
