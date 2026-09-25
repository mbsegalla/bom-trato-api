import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { CustomerRepository } from '../../domain/repositories/customer.repository.js';

export interface CustomerActorParams {
  organizationId: string;
  userId: string;
}

export interface CustomerReadContext {
  readonly customers: Pick<CustomerRepository, 'findById' | 'findByEmail' | 'list' | 'overviewSummary'>;

  readonly access: OrganizationAccessContext;
}

export interface CustomerTransaction {
  readonly customers: CustomerRepository;
  readonly access: OrganizationAccessContext;
}

export abstract class CustomerUnitOfWork {
  abstract read<T>(params: CustomerActorParams, operation: (context: CustomerReadContext) => Promise<T>): Promise<T>;
  abstract run<T>(params: CustomerActorParams, operation: (tx: CustomerTransaction) => Promise<T>): Promise<T>;
}
