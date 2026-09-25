import { randomUUID } from 'node:crypto';

import type { CustomerDetails } from '../../domain/entities/customer.entity.js';
import { Customer } from '../../domain/entities/customer.entity.js';
import type { CustomerActorParams } from '../ports/customerUnitOfWork.port.js';
import type { CustomerApplicationService } from '../services/customerApplicationService.service.js';

export class CreateCustomerUseCase {
  constructor(private readonly processor: CustomerApplicationService) {}

  execute(params: CustomerActorParams, details: CustomerDetails) {
    const { organizationId } = params;

    return this.processor.run(params, async (tx) => {
      const customer = Customer.create(
        {
          ...details,
          id: randomUUID(),
          organizationId,
        },
        new Date(),
      );

      const state = customer.snapshot();

      await this.processor.assertEmailAvailable(tx, state.email);

      await tx.customers.create(customer);

      return customer.snapshot();
    });
  }
}
