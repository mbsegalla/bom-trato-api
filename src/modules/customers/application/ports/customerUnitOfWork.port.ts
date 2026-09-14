import type { CustomerAccessContext } from '../../domain/policies/customerAccess.policy.js';
import type { CustomerRepository } from '../../domain/repositories/customer.repository.js';

export interface CustomerActorParams {
  organizationId: string;
  userId: string;
}

export interface CustomerReadContext {
  readonly customers: Pick<CustomerRepository, 'findById' | 'list'>;
  readonly access: CustomerAccessContext;
}

export interface CustomerTransaction {
  readonly customers: CustomerRepository;
  readonly access: CustomerAccessContext;
}

export abstract class CustomerUnitOfWork {
  abstract read<T>(params: CustomerActorParams, operation: (context: CustomerReadContext) => Promise<T>): Promise<T>;
  abstract run<T>(params: CustomerActorParams, operation: (tx: CustomerTransaction) => Promise<T>): Promise<T>;
}
