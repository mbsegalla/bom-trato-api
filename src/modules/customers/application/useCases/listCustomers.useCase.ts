import type { CustomerPageParams } from '../../domain/types/customer.types.js';
import type { CustomerActorParams } from '../ports/customerUnitOfWork.port.js';
import type { CustomerApplicationService } from '../services/customerApplicationService.service.js';

export class ListCustomersUseCase {
  constructor(private readonly processor: CustomerApplicationService) {}

  execute(params: CustomerActorParams, page: CustomerPageParams) {
    return this.processor.read(params, (context) => context.customers.list(page));
  }
}
