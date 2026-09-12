import type { CustomerActorParams } from '../ports/customerUnitOfWork.port.js';

export interface CustomerByIdParams extends CustomerActorParams {
  customerId: string;
}
