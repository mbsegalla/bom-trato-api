import type { CustomerPageParams } from '../../domain/types/customerPage.types.js';
import type { CustomerActorParams } from '../ports/customerUnitOfWork.port.js';
import type { CustomerApplicationService } from '../services/customerApplicationService.service.js';

export class ListCustomersUseCase {
  constructor(private readonly processor: CustomerApplicationService) {}

  execute(params: CustomerActorParams, page: CustomerPageParams) {
    return this.processor.run(params, (tx) => tx.customers.list(page));
  }
}
