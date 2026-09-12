import type { CustomerAccessContext } from '../../domain/policies/customerAccess.policy.js';
import type { CustomerRepository } from '../../domain/repositories/customer.repository.js';

export interface CustomerActorParams {
  organizationId: string;
  userId: string;
}

export interface CustomerTransaction {
  readonly customers: CustomerRepository;
  readonly access: CustomerAccessContext;
}

export abstract class CustomerUnitOfWork {
  abstract run<T>(params: CustomerActorParams, operation: (tx: CustomerTransaction) => Promise<T>): Promise<T>;
}
