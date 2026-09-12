import { Customer } from '../../domain/entities/customer.entity.js';
import { CustomerError } from '../../domain/errors/customer.error.js';
import { CustomerAccessPolicy } from '../../domain/policies/customerAccess.policy.js';
import type { CustomerActorParams, CustomerTransaction, CustomerUnitOfWork } from '../ports/customerUnitOfWork.port.js';

export class CustomerApplicationService {
  constructor(private readonly unitOfWork: CustomerUnitOfWork) {}

  run<T>(params: CustomerActorParams, operation: (tx: CustomerTransaction) => Promise<T>): Promise<T> {
    return this.unitOfWork.run(params, (tx) => {
      new CustomerAccessPolicy(tx.access).assertCanManage();

      return operation(tx);
    });
  }

  async load(tx: CustomerTransaction, id: string): Promise<Customer> {
    const state = await tx.customers.findById(id);

    if (state === null) {
      throw new CustomerError('CUSTOMER_NOT_FOUND');
    }

    return Customer.restore(state);
  }
}
